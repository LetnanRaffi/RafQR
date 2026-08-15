-- ============================================================
-- RafQR — MIGRASI KEAMANAN (jalankan sekali di Supabase SQL Editor)
-- ============================================================
-- Aman di-run ulang (idempotent). Cukup PASTE semua & Run.
-- Isi:
--   1. Hapus policy Storage publik DELETE & UPDATE (bahaya)
--   2. Pastikan policy Read + Upload publik ada
--   3. Fungsi agregasi analytics (get_analytics_overview)
-- ============================================================

-- ------------------------------------------------------------
-- 1. STORAGE POLICIES — buang DELETE & UPDATE publik
-- ------------------------------------------------------------
-- Sebelumnya siapa pun anonim bisa MENGHAPUS / MENIMPA file siapa pun.
-- App tidak butuh operasi ini dari client (pembersihan dilakukan
-- server-side pakai SERVICE_ROLE_KEY).
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Access" ON storage.objects;

-- ------------------------------------------------------------
-- 2. Pastikan policy yang DIBUTUHKAN tetap ada (read + upload)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tempshare');

DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
CREATE POLICY "Public Upload Access"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'tempshare');

-- ------------------------------------------------------------
-- 3. Fungsi agregasi analytics (dipanggil server via rpc)
-- ------------------------------------------------------------
-- Supaya dashboard admin tidak menarik semua baris ke memori.
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

-- ------------------------------------------------------------
-- 4. VERIFIKASI (cek hasil di bawah)
-- ------------------------------------------------------------
-- Harus tampil HANYA 2 policy: "Public Read Access" (SELECT) &
-- "Public Upload Access" (INSERT). TIDAK boleh ada DELETE/UPDATE.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;

-- Tes fungsi analytics (harus balikin 1 baris json)
SELECT get_analytics_overview();
