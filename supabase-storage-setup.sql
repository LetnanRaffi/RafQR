-- Supabase Storage Setup for RafQR
-- Run this ENTIRE script in Supabase SQL Editor

-- ========================================
-- 1. CREATE BUCKET (if not exists)
-- ========================================
-- Note: If bucket already exists, skip this section
-- You can also create via Dashboard: Storage → New Bucket

INSERT INTO storage.buckets (id, name, public)
VALUES ('tempshare', 'tempshare', true)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ========================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 3. CREATE POLICIES FOR PUBLIC ACCESS
-- ========================================

-- Policy 1: Allow public to view files (SELECT)
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tempshare');

-- Policy 2: Allow public to upload files (INSERT)
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
CREATE POLICY "Public Upload Access"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'tempshare');

-- Policy 3: Allow public to delete their own files (DELETE)
-- Optional: Remove this if you don't want users to delete files
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
CREATE POLICY "Public Delete Access"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'tempshare');

-- Policy 4: Allow public to update files (UPDATE)
-- Optional: For file metadata updates
DROP POLICY IF EXISTS "Public Update Access" ON storage.objects;
CREATE POLICY "Public Update Access"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'tempshare')
WITH CHECK (bucket_id = 'tempshare');

-- ========================================
-- 4. CREATE INDEX FOR BETTER PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_objects_bucket_id 
ON storage.objects(bucket_id);

CREATE INDEX IF NOT EXISTS idx_objects_created_at 
ON storage.objects(created_at DESC);

-- ========================================
-- 5. VERIFY SETUP
-- ========================================
-- Check if bucket exists
SELECT * FROM storage.buckets WHERE id = 'tempshare';

-- Check policies
SELECT * FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects';

-- ========================================
-- IMPORTANT NOTES:
-- ========================================
-- 1. Make sure bucket is PUBLIC in Dashboard
-- 2. Verify NEXT_PUBLIC_SUPABASE_URL is correct
-- 3. Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is correct
-- 4. For production, consider adding file size limits
-- 5. Consider adding file type validation in your app
