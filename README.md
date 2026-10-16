# RafQR — Monochrome v2.2

Transfer file dan teks dari PC ke HP via QR Code. Mode Cloud menyimpan file sementara selama 30 menit. Mode langsung (P2P) memakai WebRTC dan dapat diaktifkan setelah validasi perangkat.

## Fitur Unggulan

- 🚀 **Transfer Instan**: Unggah langsung ke Cloudflare R2 dari browser lewat presigned URL, tanpa lewat server.
- 📱 **QR Code Download**: Pindai dan akses konten di HP seketika.
- 🕒 **Auto-Expiry**: Sesi dan file otomatis terhapus dalam 30 menit.
- 🔒 **Aman & Privat**: Tanpa registrasi, pembersihan otomatis oleh sistem.
- 🎨 **Premium Monochrome UI**: Desain minimalis brutalist yang bersih dan modern.
- 📁 **Multi-File & Text**: Kirim banyak file sekaligus atau catatan teks panjang.
- 🔗 **Mode Langsung (P2P)**: Transfer browser ke browser melalui WebRTC, dengan verifikasi SHA-256 dan pilihan pindah ke Cloud jika koneksi gagal. Aktif hanya jika `NEXT_PUBLIC_P2P_ENABLED=true`.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Hosting**: Vercel
- **Styling**: Tailwind CSS 3
- **Storage**: Cloudflare R2 (presigned PUT/GET via AWS SDK v3)
- **Session**: Upstash Redis (TTL 30 menit + rate limiting)
- **Analytics**: Supabase **Postgres** — hanya untuk metrik dashboard, bukan penyimpanan file
- **QR Code**: qrcode.react
- **P2P signaling**: Cloudflare Worker + Durable Object; file bergerak melalui WebRTC DataChannel.
- **Icon**: Lucide-inspired SVG / Custom Logo

> Supabase **Storage** tidak lagi dipakai. Seluruh file berada di R2 dan tidak pernah melewati server aplikasi.

## Persiapan Mandiri (Self-Hosting)

### Prasyarat

- Node.js 18+ dan npm
- Akun [Cloudflare](https://dash.cloudflare.com/) (bucket R2)
- Akun [Upstash](https://upstash.com/) (Redis)
- Akun [Supabase](https://supabase.com/) (Postgres untuk analytics saja)
- Akun [Vercel](https://vercel.com/) (opsional, bisa self-host sendiri)

### Instalasi

1. **Clone repository**:
   ```bash
   git clone https://github.com/LetnanRaffi/RafQR.git
   cd RafQR
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Konfigurasi Environment Variables**:
   Salin `.env.local.example` menjadi `.env.local` dan isi:
   ```env
   # Cloudflare R2 (wajib — storage semua file)
   R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your-access-key-id
   R2_SECRET_ACCESS_KEY=your-secret-access-key
   R2_BUCKET=rafqr

   # Batas upload (opsional, ada default)
   NEXT_PUBLIC_MAX_FILE_MB=2048   # per file, default 2 GB
   NEXT_PUBLIC_MAX_ZIP_MB=512    # batas memori JSZip, bukan batas transfer
   MAX_SESSION_MB=10240          # total per sesi, default 10 GB

   # Upstash Redis (wajib — session, TTL, rate limit)
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token

   # Supabase Postgres (hanya analytics; tanpa ini dashboard /admin kosong)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # Kunci dashboard /admin — jangan pakai prefix NEXT_PUBLIC_
   ADMIN_SECRET=pilih-string-acak-panjang

   # Mode P2P (aktifkan setelah uji perangkat)
   NEXT_PUBLIC_P2P_ENABLED=true
   NEXT_PUBLIC_P2P_SIGNALING_URL=https://rafqr-signaling-production.<subdomain>.workers.dev
   NEXT_PUBLIC_P2P_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
   NEXT_PUBLIC_P2P_CHUNK_BYTES=16384
   NEXT_PUBLIC_P2P_CONNECT_TIMEOUT_MS=10000
   NEXT_PUBLIC_P2P_BLOB_MAX_MB=100
   ```

### Mode langsung (P2P)

Mode P2P memakai signaling Worker terpisah; Worker hanya menangani kode sesi dan pesan WebRTC. Konfigurasi serta perintah deploy ada di [signaling/README.md](signaling/README.md). `ALLOWED_ORIGINS` di Worker harus memuat origin frontend yang dipakai. Untuk pengembangan lokal, jalankan `npx wrangler dev --config signaling/wrangler.jsonc --port 8787`, lalu jalankan Next.js dengan `NEXT_PUBLIC_P2P_ENABLED=true` dan `NEXT_PUBLIC_P2P_SIGNALING_URL=http://127.0.0.1:8787`.

Penerima perlu mengetuk tombol simpan untuk setiap file. Chrome dengan File System Access API menulis langsung ke disk; browser lain hanya dapat memakai unduhan Blob untuk file sampai batas `NEXT_PUBLIC_P2P_BLOB_MAX_MB`. Koneksi WebRTC terenkripsi dengan DTLS. Tidak ada resume atau TURN pada konfigurasi awal; jaringan NAT ketat dapat gagal dan pengirim dapat memakai tombol Cloud dengan file yang sudah dipilih.

Setelah deploy production, uji transfer 2 GB di Chrome desktop dan Chrome Android fisik, file kosong, beberapa file, putus koneksi, fallback Cloud, serta unduhan Cloud. Build dan tes lokal saja tidak membuktikan kestabilan perangkat fisik.

### Konfigurasi Cloudflare R2

1. Buat bucket, misalnya `rafqr` (harus sama dengan `R2_BUCKET`).
2. Pasang CORS — **wajib**, upload dari browser langsung ke R2. File siap pakai di repo:
   ```bash
   npx wrangler r2 bucket cors set rafqr --file r2-cors.json
   ```
   Sesuaikan `AllowedOrigins` di `r2-cors.json` dengan domain produksi kamu.
3. Buat **R2 API Token** dengan permission *Object Read & Write* pada bucket tersebut. Isi `R2_ACCESS_KEY_ID` dan `R2_SECRET_ACCESS_KEY` dengan Access Key ID + Secret-nya (bukan Cloudflare API Token).
4. Opsional tapi disarankan: **lifecycle rule** auto-hapus objek setelah 1 hari, sebagai jaring pengaman kalau ada blob yang yatim.

### Konfigurasi Upstash Redis

Buat database Redis baru, salin **URL** dan **Token REST**.

### Konfigurasi Supabase (analytics)

Jalankan `supabase-setup-full.sql` di SQL Editor untuk membuat tabel `analytics_visits`, `analytics_transfers`, dan fungsi `get_analytics_overview()`. Tidak ada bucket storage yang perlu dibuat.

## Pengembangan

Jalankan server pengembangan:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

## Troubleshooting Upload

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| `"Storage belum dikonfigurasi."` | Variabel `R2_*` kosong / salah di Vercel | Isi ulang di Environment Variables lalu redeploy |
| Gagal di HP, jalan di laptop | **CORS bucket R2 belum diset** — penyebab paling sering | `npx wrangler r2 bucket cors set rafqr --file r2-cors.json`, pastikan `AllowedOrigins` memuat domain kamu |
| `"File melebihi batas 2 GB."` | File > `NEXT_PUBLIC_MAX_FILE_MB` (`lib/limits.ts`) | Kompres atau pecah file |
| `"Total ukuran sesi melebihi batas 10 GB."` | Total file dalam satu sesi melewati `MAX_SESSION_MB` | Kirim dalam beberapa sesi |
| `"Upload timeout."` | Transfer melebihi budget waktu (`lib/r2-client.ts`, ±1,5 detik per MB) | Uji dengan file kecil dulu; cek koneksi |
| Upload macet lalu gagal | Presigned PUT kedaluwarsa setelah 1 jam (`PUT_TTL`, `lib/r2.ts`) | Kirim file lebih kecil, atau naikkan `PUT_TTL` |
| `"Terlalu banyak permintaan."` | Rate limit: 30 sesi/menit atau 60 upload/menit per IP | Tunggu sebentar |

Tombol "Unduh semua (.zip)" otomatis hilang kalau total sesi melewati `MAX_ZIP_MB`, karena JSZip memuat seluruh sesi ke memori browser. Unduh per file tetap jalan tanpa batas tersebut.

Untuk debug, buka `/api/upload-url` langsung di browser — kalau berhasil mengembalikan `{ uploadUrl, key }`, berarti sisi server dan R2 sudah benar, masalahnya di CORS browser.

## Lisensi

MIT

## Author

**RafQR** — Developed by **RaffiTech Solutions**
Built with ❤️ using Next.js on Vercel, Cloudflare R2, Upstash Redis, and Supabase Postgres.
