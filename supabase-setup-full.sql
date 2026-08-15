-- ============================================================
-- RafQR - FULL SUPABASE SETUP (satu file, jalanin sekali)
-- ============================================================
-- Isi:
--   1. Tabel analytics (analytics_visits, analytics_transfers)
--   2. Fix kolom yang hilang (file_size, file_name)
--   3. Storage bucket "tempshare" + policies (untuk Supabase modern)
--
-- Jalankan ENTIRE script ini sekali di Supabase SQL Editor.
-- Aman dijalankan ulang (idempotent).

-- ============================================================
-- 1. ANALYTICS TABLES
-- ============================================================

-- Tabel visitor harian
CREATE TABLE IF NOT EXISTS analytics_visits (
  id BIGSERIAL PRIMARY KEY,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabel transfer file
CREATE TABLE IF NOT EXISTS analytics_transfers (
  id BIGSERIAL PRIMARY KEY,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  file_id TEXT NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_visits_date ON analytics_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON analytics_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_transfers_file_id ON analytics_transfers(file_id);

-- ============================================================
-- 2. FIX KOLOM YANG HILANG DI analytics_transfers
-- ============================================================
-- Kode (app/api/analytics/route.ts) meng-INSERT & SELECT file_size + file_name.
-- Tanpa ini, pencatatan transfer ERROR "column does not exist"
-- dan dashboard GB / Largest Asset kosong.

ALTER TABLE analytics_transfers
  ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT 'unknown';

-- Backfill baris lama kalau sudah ada data sebelumnya
UPDATE analytics_transfers
SET file_size = COALESCE(file_size, 0),
    file_name = COALESCE(file_name, 'unknown');

-- ============================================================
-- 3. RLS + POLICIES ANALYTICS
-- ============================================================
ALTER TABLE analytics_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_transfers ENABLE ROW LEVEL SECURITY;

-- Public boleh insert (tracking), tidak boleh select/update/delete
DROP POLICY IF EXISTS "Allow public insert visits" ON analytics_visits;
CREATE POLICY "Allow public insert visits" ON analytics_visits
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public insert transfers" ON analytics_transfers;
CREATE POLICY "Allow public insert transfers" ON analytics_transfers
  FOR INSERT
  WITH CHECK (true);

-- Service role boleh baca semua
DROP POLICY IF EXISTS "Service role can read all visits" ON analytics_visits;
CREATE POLICY "Service role can read all visits" ON analytics_visits
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can read all transfers" ON analytics_transfers;
CREATE POLICY "Service role can read all transfers" ON analytics_transfers
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

-- View ringkasan analytics (opsional)
CREATE OR REPLACE VIEW analytics_summary AS
SELECT
  COALESCE(v.visitors_today, 0) as visitors_today,
  COALESCE(t.total_transfers, 0) as total_transfers,
  COALESCE(t.transfers_today, 0) as transfers_today
FROM (
  SELECT COUNT(*) as visitors_today
  FROM analytics_visits
  WHERE visit_date = CURRENT_DATE
) v
CROSS JOIN (
  SELECT
    COUNT(*) as total_transfers,
    COUNT(*) FILTER (WHERE transfer_date = CURRENT_DATE) as transfers_today
  FROM analytics_transfers
) t;

-- Fungsi agregasi analytics (dipanggil server via rpc) supaya dashboard
-- tidak menarik semua baris ke memori. Aman dijalankan ulang.
CREATE OR REPLACE FUNCTION get_analytics_overview()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'totalTransfers', (SELECT COUNT(*) FROM analytics_transfers),
    'totalSizeBytes', (SELECT COALESCE(SUM(file_size), 0) FROM analytics_transfers),
    'largestFile', COALESCE(
      (SELECT json_build_object('file_name', file_name, 'file_size', file_size)
       FROM analytics_transfers ORDER BY file_size DESC NULLS LAST LIMIT 1),
      json_build_object('file_name', 'None', 'file_size', 0)
    ),
    'totalVisitors', (SELECT COUNT(*) FROM analytics_visits),
    'chartData', (
      SELECT COALESCE(
        json_agg(json_build_object('date', to_char(day, 'YYYY-MM-DD'), 'count', c) ORDER BY day),
        '[]'::json
      )
      FROM (
        SELECT d::date AS day,
          (SELECT COUNT(*) FROM analytics_transfers t WHERE t.transfer_date = d::date) AS c
        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
      ) series
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_analytics_overview() TO service_role;

-- ============================================================
-- 4. STORAGE BUCKET "tempshare"
-- ============================================================
-- Buat bucket via INSERT langsung ke storage.buckets (role postgres
-- masih boleh INSERT, jadi aman di semua versi Supabase).
-- Kolom "owner" disertakan untuk versi Supabase lama (NOT NULL).
-- Kalau kolom "owner" tidak ada (versi baru), otomatis fallback.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'tempshare') THEN
    BEGIN
      INSERT INTO storage.buckets (id, name, public, owner)
      VALUES ('tempshare', 'tempshare', true, '00000000-0000-0000-0000-000000000000');
    EXCEPTION WHEN undefined_column THEN
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('tempshare', 'tempshare', true);
    END;
  ELSE
    UPDATE storage.buckets SET public = true WHERE id = 'tempshare';
  END IF;
END $$;

-- CATATAN PENTING:
-- Supabase (mulai 2025) tidak mengizinkan role postgres meng-ALTER
-- storage.objects (harus owner = supabase_storage_admin). RLS pada
-- storage.objects SUDAH AKTIF by default, jadi statement
-- "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY" dihapus.
-- CREATE POLICY sebagai postgres tetap dicoba di bawah (pada beberapa
-- project masih diizinkan). KALAU ERROR "must be owner of table objects"
-- atau "permission denied", buat policy manual via Dashboard:
--   Storage -> Policies -> "tempshare" -> New Policy
--   mode "Create a policy for public access" (SELECT, INSERT, UPDATE, DELETE).
--   Policy INSERT WAJIB ada, tanpa itu upload error RLS violation.

-- Policy 1: Public read/download
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tempshare');

-- Policy 2: Public upload
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
CREATE POLICY "Public Upload Access"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'tempshare');

-- SECURITY: DELETE & UPDATE publik DIHAPUS (dulu mengizinkan anonim
-- menghapus/menimpa file siapa pun). Pembersihan dilakukan server-side
-- dengan SERVICE_ROLE_KEY.
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Access" ON storage.objects;

-- ============================================================
-- 5. VERIFIKASI (akan tampil di bawah, cek hasilnya)
-- ============================================================

-- Kolom analytics_transfers harus: id, transfer_date, file_id,
--   transferred_at, created_at, file_size, file_name
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analytics_transfers'
ORDER BY ordinal_position;

-- Bucket harus tampil dengan public = true
SELECT id, name, public FROM storage.buckets WHERE id = 'tempshare';

-- Policies storage harus tampil
SELECT policyname, cmd, permissive, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- ============================================================
-- CATATAN:
-- 1. Kalau CREATE POLICY "TO public" error "role public does not exist"
--    atau "permission denied", ganti TO public menjadi TO anon, authenticated.
-- 2. Pastikan .env.local berisi:
--      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
--      SUPABASE_SERVICE_ROLE_KEY
-- 3. Uji upload dari browser:
--      https://<project-ref>.supabase.co/storage/v1/object/public/tempshare/test.txt
-- 4. Script storage otomatis menyesuaikan versi Supabase:
--    - bucket dibuat via INSERT (semua versi aman)
--    - policy dibuat sebagai role postgres; kalau ditolak, buat via
--      Dashboard Storage -> Policies (mode public access)
--    - ALTER TABLE storage.objects ENABLE RLS DIHAPUS karena sudah aktif
--      by default dan dilarang untuk role postgres di Supabase 2025+
-- 5. KALAU CREATE POLICY di atas ERROR "must be owner of table objects"
--    atau "permission denied" -> buat policy manual via Dashboard (dijamin):
--      Storage → Policies → "tempshare" → New Policy
--      pilih mode "Create a policy for public access"
--      (buat untuk SELECT, INSERT, UPDATE, DELETE)
-- 6. Kalau upload masih error "new row violates row-level security policy",
--    jalankan file khusus: supabase-storage-policies.sql
-- ============================================================
