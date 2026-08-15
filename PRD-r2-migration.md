# RafQR — Migrasi Storage: Supabase → Cloudflare R2

Status: kode selesai (build hijau) · Deploy: Vercel · Pola: presigned URL (S3-compatible)

## Kenapa
File numpuk di Supabase Storage + bucket publik. R2 + presigned URL + lifecycle rule
= privat, auto-expire, murah. Analytics tetap di Supabase (Postgres).

## Arsitektur
- Upload: client minta `POST /api/upload-url` → presigned PUT → client `PUT` langsung ke R2.
- Download: `GET /api/session` & `/verify` mint presigned GET dari `storageRef` (expire 30 mnt).
- Cleanup: ghost/`DELETE` → `DeleteObjects` ke R2. Expiry natural → lifecycle rule R2.
- Kredensial R2 server-only (`.env.local` + `.env.cloudflare`), tidak pernah ke client.

## Fase 1 — Upload ke R2 ✅
- [x] `lib/r2.ts` (S3 client R2, presignPut/presignGet/deleteObjects, isValidKey).
- [x] `POST /api/upload-url` (rate-limit 60/mnt, batas 50 MB, key server-generated).
- [x] `lib/r2-client.ts` (`uploadFileToR2`: minta presign → XHR PUT, progress preserved).
- [x] Ganti `uploadFileToSupabase` → `uploadFileToR2` di `app/page.tsx` & `app/u/[id]/page.tsx`.

## Fase 2 — Download & lifecycle ✅
- [x] `withSignedUrls` (R2 presigned GET) di session `GET`/`verify`.
- [x] Cleanup blob R2 di `PATCH` (ghost) & `DELETE`.
- [x] Validasi `storageRef` (pola `uploads/…`) gantikan cek URL Supabase.

## Fase 3 — Cabut Supabase Storage ✅
- [x] Hapus `lib/supabase-storage.ts` + `lib/supabase-admin.ts`.
- [x] `debug-upload` dialihkan ke uji R2.
- [x] Env example dirapikan (buang `NEXT_PUBLIC_SUPABASE_ANON_KEY`, tambah `R2_*`).
- [x] `npm install` (aws-sdk masuk, firebase & 82 paket ter-prune). Build hijau.

## Langkah manual (dashboard R2) — WAJIB biar jalan
- [ ] **CORS** bucket `rafqr` (browser PUT/GET langsung):
```json
[
  {
    "AllowedOrigins": ["https://qr.raffitech.biz.id", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
- [ ] **Lifecycle rule**: R2 → bucket `rafqr` → Settings → Object lifecycle → delete objects setelah **1 hari** (auto-expire, ganti cron).
- [ ] **Vercel env**: paste 5 baris `R2_*` dari `.env.cloudflare` ke Project Settings → Environment Variables.
- [ ] Bucket `rafqr` biarkan **privat** (default) — download lewat presigned GET.

## Catatan keamanan
- Token `cfat_…` (Cloudflare API token) yang dikirim TIDAK dipakai app — hanya Access Key ID + Secret + endpoint yang dibutuhkan S3. Simpan/rotasi token itu terpisah.
- Secret dibagikan via chat → disarankan rotasi Access Key R2 setelah verifikasi, dan jangan commit `.env.cloudflare`/`.env.local` (sudah di-gitignore).
