-- RafQR - FIX Storage policy (RLS violation saat upload/transfer)
-- Jalankan di Supabase SQL Editor KALAU upload error:
--   "new row violates row-level security policy"
--
-- Cara kerja: bikin 4 policy public sebagai role postgres.
--
-- KALAU ERROR "must be owner of table objects" / "permission denied":
--   buat policy manual via Dashboard (dijamin jalan):
--     Dashboard -> Storage -> Policies -> "tempshare" -> New Policy
--     mode "Create a policy for public access", ulangi untuk tiap operasi:
--     SELECT, INSERT, UPDATE, DELETE.
--   PENTING: policy INSERT WAJIB ada, itu penyebab error RLS saat upload.

-- Cek dulu kondisi sekarang
SELECT '=== BUCKET ===' as info;
SELECT id, name, public FROM storage.buckets WHERE id = 'tempshare';

SELECT '=== POLICIES SAAT INI ===' as info;
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;

-- Policy 1: Public read/download
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tempshare');

-- Policy 2: Public upload  <-- INI YANG BIKIN ERROR RLS VIOLATION
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
CREATE POLICY "Public Upload Access"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'tempshare');

-- SECURITY: DELETE & UPDATE publik DIHAPUS.
-- Sebelumnya siapa pun anonim bisa menghapus/menimpa file siapa pun.
-- App tidak butuh operasi ini dari client; pembersihan dilakukan
-- server-side memakai SERVICE_ROLE_KEY (lihat Fase 2).
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Access" ON storage.objects;

-- Verifikasi akhir: harus muncul 2 policy (Read, Upload)
SELECT '=== POLICIES SETELAH FIX ===' as info;
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;
