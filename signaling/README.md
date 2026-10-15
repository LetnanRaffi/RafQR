# RafQR signaling

Cloudflare Worker dan Durable Object ini hanya membawa pesan WebRTC (`join`, `offer`, `answer`, `ice`). Byte file dikirim langsung melalui RTCDataChannel.

## Kontrak

- `POST /sessions` → `{ code, senderToken, expiresAt }`.
- `GET /sessions/:code/ws` dengan WebSocket; pesan pertama harus `{"type":"join","role":"sender","token":"<senderToken>"}` atau `{"type":"join","role":"receiver"}`.
- Server membalas `joined`, memberi tahu peer melalui `join` dan `peer-joined`, lalu meneruskan `offer`/`answer`/`ice`. `peer-left` dan `error` melaporkan pemutusan atau kegagalan.
- Satu kode hanya menerima satu receiver. Masa tunggu 10 menit dimulai saat sesi dibuat. Setelah receiver bergabung, transfer yang sedang berjalan boleh lebih lama.

`Origin` harus cocok dengan salah satu nilai `ALLOWED_ORIGINS` yang dipisahkan koma. Set alamat frontend Vercel Preview di staging dan domain publik di production sebelum deploy. Token pengirim tidak boleh dimasukkan ke QR/link penerima.

Pembuatan sesi dibatasi 30 kali per menit per alamat IP melalui rate limiting binding Cloudflare. Batas ini bersifat lokal per lokasi edge dan dapat menyentuh beberapa pengguna di balik NAT yang sama; sebelum layanan dibuka luas, tambahkan pengendalian abuse yang lebih kuat.

## Pengembangan

Jalankan dari root repo: `npx wrangler dev --config signaling/wrangler.jsonc`. Untuk memeriksa bundel: `npx wrangler deploy --dry-run --config signaling/wrangler.jsonc --env production`.

Saat Worker lokal berjalan, jalankan `node signaling/tests/smoke.cjs` dan `node signaling/tests/rate-limit.cjs` untuk memeriksa protokol serta batas pembuatan sesi.

Untuk deployment staging/production: `npx wrangler deploy --config signaling/wrangler.jsonc --env staging` atau `--env production`. Kedua environment memakai namespace Durable Object terpisah. Konfigurasi frontend perlu menunjuk ke URL Worker yang sesuai.
