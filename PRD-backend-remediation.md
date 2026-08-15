# RafQR — Backend Security Remediation PRD

Status: in progress · Owner: eng · Scope: backend (`app/api/*`, `lib/*`, SQL). Frontend disentuh hanya bila perlu ikut perubahan kontrak API.

## Konteks
Temuan audit: proteksi PIN palsu (client-side), file publik permanen, policy Storage DELETE/UPDATE publik, endpoint analytics tanpa auth, tak ada rate-limit, data client tak divalidasi, blob tak pernah dibersihkan.

## Prinsip
- Tidak menyentuh alur E2EE (kunci tetap client-only).
- Perubahan backward-compatible; toggle dashboard didokumentasikan, bukan diasumsikan aktif.
- Verifikasi `npm run build` di akhir tiap fase.

---

## Fase 1 — Kontrol akses (paling kritis, app-code + SQL)
- [x] 1.1 Gate PIN server-side. `GET /api/session` tidak lagi membalikkan `pin`; saat terkunci, `files`/`textContent` ditahan (`locked:true`). Tambah `POST /api/session/verify` `{id,pin}` → server bandingkan → balikin data penuh. Update `app/d/[id]/page.tsx`.
- [x] 1.2 Proteksi `GET /api/analytics` dengan `ADMIN_SECRET` (server-only, header `x-admin-key`). Hapus `NEXT_PUBLIC_ADMIN_PIN`; login admin lewat percobaan fetch berautentikasi.
- [x] 1.3 Hapus policy Storage publik DELETE & UPDATE (sisakan SELECT+INSERT) di kedua file SQL. Matikan `x-upsert` di `lib/supabase-storage.ts`.
- [x] 1.4 `npm run build` hijau.

## Fase 2 — Lifecycle data & anti-abuse (app + config)
- [x] 2.1 Signed URL: server hasilkan URL ber-expiry dari `storageRef` (service role, `lib/supabase-admin.ts`). GET & verify menandatangani URL. Fallback ke URL tersimpan bila service role belum diset.
- [x] 2.2 Cleanup blob: ghost (`PATCH`) & `DELETE` menghapus objek Storage via `storageRef`.
- [x] 2.3 Rate-limit `POST /api/session` (30/mnt), `POST /api/session/verify` (10/mnt anti brute-force PIN), `POST /api/analytics` (60/mnt) — Redis INCR+EXPIRE, tanpa dependency baru.
- [x] 2.4 Validasi `firebaseUrl` harus origin project sendiri + batas ukuran (50 MB/file, 250 MB/sesi) di `POST /api/session`.
- [x] 2.5 `npm run build` hijau.

### Langkah manual (dashboard/infra) — di luar kode
- [ ] Jadikan bucket `tempshare` **privat** (Storage → Settings → uncheck Public). Kode sudah pakai signed URL, jadi download tetap jalan; setelah privat, file tak lagi bisa diakses tanpa signed URL.
- [ ] Set **file size limit** bucket ke 50 MB di dashboard.
- [ ] Isi `ADMIN_SECRET` & `SUPABASE_SERVICE_ROLE_KEY` di environment produksi.
- [ ] (Orphan cleanup) Blob dari sesi yang expire natural (bukan ghost/delete) belum otomatis terhapus — jadwalkan Supabase scheduled task / cron memanggil pembersih. Ditandai untuk Fase lanjutan.

## Fase 3 — Hardening & cleanup
- [x] 3.1 Klaim ID atomik (`SET NX` via `claimFileSession`) di alур create/receive; overwrite placeholder WAITING tetap diizinkan.
- [x] 3.2 Agregasi analytics di SQL (`get_analytics_overview()` rpc) dengan fallback in-app bila fungsi belum dipasang.
- [x] 3.3 PBKDF2 100k→600k + panjang kunci minimum 6→8.
- [x] 3.4 Buang `lib/firebase.ts` + dependency `firebase` + field `broadcast` + log verbose upload + env firebase.
- [x] 3.5 `npm run build` hijau.

> Catatan: `firebase` sudah dihapus dari `package.json`; jalankan `npm install` untuk memangkas `node_modules` + lockfile. Nama field `firebaseUrl` sengaja dipertahankan (legacy) agar tidak memicu rename lintas frontend.
