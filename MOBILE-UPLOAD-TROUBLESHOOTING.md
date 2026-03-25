# Mobile Upload Troubleshooting Guide

## Masalah: "Network error during upload" dari HP

### Penyebab Umum & Solusi:

#### 1. **Supabase Storage Bucket Belum Ada**
```
Error: Storage bucket "tempshare" not found
```

**Solusi:**
- Buka Supabase Dashboard
- Pergi ke **Storage** → **New Bucket**
- Nama bucket: `tempshare`
- Centang **Public bucket**
- Klik **Create bucket**

#### 2. **Bucket Policy Belum Public**
```
Error: Upload blocked by Supabase Storage policy
```

**Solusi:**
- Buka Supabase Dashboard → **Storage** → **Policies**
- Pilih bucket `tempshare`
- Klik **New Policy** → **For full customization**
- Pilih **INSERT** operation
- Policy definition:
```sql
CREATE POLICY "Public Access"
ON storage.objects FOR INSERT
TO public
WITH (bucket_id = 'tempshare');
```
- Juga tambahkan untuk SELECT jika perlu

#### 3. **Environment Variables Salah**
```
Error: Cannot connect to server
```

**Solusi:**
- Pastikan `.env.local` memiliki:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
- URL harus format: `https://xxxxx.supabase.co` (tanpa trailing slash)
- Restart server setelah change env

#### 4. **CORS Issue**
Mobile browser lebih strict dengan CORS.

**Solusi:**
- Di Supabase Dashboard → **API Settings**
- Pastikan **CORS Origins** includes:
  - `http://localhost:3000` (development)
  - Your production domain
- Atau set ke `*` untuk testing

#### 5. **Mixed Content (HTTP vs HTTPS)**
Jika deploy ke production:
- Pastikan akses via **HTTPS**
- Supabase URL juga harus **HTTPS**

#### 6. **File Terlalu Besar / Koneksi Lambat**
```
Error: Upload timeout
```

**Solusi:**
- Default timeout: 60 detik
- Untuk file besar (>10MB), butuh koneksi stabil
- Coba file kecil dulu (<1MB) untuk testing

### Testing Checklist:

1. [ ] Bucket `tempshare` sudah dibuat
2. [ ] Bucket adalah **Public**
3. [ ] Policy INSERT untuk public sudah ada
4. [ ] `NEXT_PUBLIC_SUPABASE_URL` benar
5. [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` benar
6. [ ] CORS origins sudah diset
7. [ ] Test upload file kecil (<1MB) dulu
8. [ ] Test dari WiFi dan mobile data

### Debug Mode:

Buka browser console di HP (Chrome Remote Debugging):
1. Connect HP ke PC via USB
2. Buka `chrome://inspect` di Chrome PC
3. Pilih device dan inspect
4. Lihat console log untuk error detail

Log yang akan muncul:
```
[Supabase] Starting upload: uploads/1234567890_file.jpg
[Supabase] Upload URL: https://xxx.supabase.co/storage/v1/...
[Supabase] Upload complete, public URL: https://...
```

### Quick Fix Command:

Jika perlu reset bucket:
```sql
-- Di Supabase SQL Editor
-- Delete semua file lama
DELETE FROM storage.objects WHERE bucket_id = 'tempshare';

-- Recreate policy
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR INSERT
TO public
WITH (bucket_id = 'tempshare');
```

## Contact

Jika masih ada masalah, check:
- Supabase Dashboard → Logs
- Browser console errors
- Network tab untuk failed requests
