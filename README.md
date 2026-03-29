# RafQR — Monochrome v2.2

Transfer file dan teks dari PC ke HP secara instan via QR Code. Data disimpan sementara dan otomatis terhapus dalam 30 menit.

## Fitur Unggulan

- 🚀 **Transfer Instan**: Unggah langsung ke Supabase Storage (client-side).
- 📱 **QR Code Download**: Pindai dan akses konten di HP seketika.
- 🕒 **Auto-Expiry**: Sesi dan file otomatis terhapus dalam 30 menit.
- 🔒 **Aman & Privat**: Tanpa registrasi, pembersihan otomatis oleh sistem.
- 🎨 **Premium Monochrome UI**: Desain minimalis brutalist yang bersih dan modern.
- 📁 **Multi-File & Text**: Kirim banyak file sekaligus atau catatan teks panjang.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Storage**: Supabase Storage
- **Database**: Upstash Redis (Session & TTL management)
- **QR Code**: qrcode.react
- **Icon**: Lucide-inspired SVG / Custom Logo

## Persiapan Mandiri (Self-Hosting)

### Prasyarat

- Node.js 18+ dan npm
- Akun [Supabase](https://supabase.com/) (untuk Storage)
- Akun [Upstash](https://upstash.com/) (untuk Redis)

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
   Buat file `.env.local` dan isi dengan kredensial berikut:
   ```env
   # Supabase (Client-side)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

   # Upstash Redis
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token

   # App URL (Optional for production)
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   ```

### Konfigurasi Database & Storage

1. **Supabase Storage**:
   - Buat Bucket baru bernama `tempshare`.
   - Set bucket menjadi **Public**.
   - Tambahkan Policy di Tab **Policies**:
     - Cari `"Public Access"` untuk operasi `INSERT` agar user bisa mengunggah file.
     - Tambahkan label `public` pada target role.

2. **Upstash Redis**:
   - Buat database Redis baru.
   - Salin URL dan Token REST.

## Pengembangan

Jalankan server pengembangan:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

## Troubleshooting Mobile

Jika Anda mengalami masalah "Network Error" saat unggah dari HP:
1. Pastikan **CORS** di Supabase sudah diset ke `*` atau domain Anda.
2. Pastikan bucket `tempshare` sudah bertanda **Public**.
3. Cek panduan lengkap di [MOBILE-UPLOAD-TROUBLESHOOTING.md](./MOBILE-UPLOAD-TROUBLESHOOTING.md).

## Lisensi

MIT

## Author

**RafQR** — Developed by **RaffiTech Solutions**
Built with ❤️ using Next.js, Supabase, and Redis.
