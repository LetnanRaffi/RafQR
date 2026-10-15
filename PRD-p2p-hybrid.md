# RafQR — Mode P2P (WebRTC) dengan Fallback Cloud R2

Status: PRD siap implementasi · Target awal: Chrome desktop dan Chrome Android · Frontend: Next.js di Vercel · Signaling: Cloudflare Worker + Durable Object

## 1. Ringkasan dan tujuan

RafQR menambah pilihan **Langsung (P2P)** untuk mengirim file dari satu browser ke browser lain melalui WebRTC DataChannel. Isi file tidak diunggah ke RafQR atau R2 pada mode ini. **Simpan 30 menit (Cloud)** tetap tersedia sebagai pilihan manual dan jalan keluar ketika koneksi langsung gagal.

Tujuan fase awal: mengurangi pemakaian R2, memberi pilihan transfer langsung yang lebih privat, dan menjaga pengalaman pindah file PC–HP tetap sederhana. Rancangan sesi dan batas akses harus layak dikembangkan untuk penggunaan publik, walau rilis awal ditujukan untuk penggunaan pribadi.

## 2. Kondisi saat ini dan batasan

- Frontend memakai Next.js App Router di Vercel. Alur Cloud mengunggah browser → R2 melalui presigned PUT; metadata sesi disimpan di Upstash Redis selama 30 menit. Unduhan memakai presigned GET. R2 memiliki mekanisme pembersihan objek tersendiri, sehingga TTL sesi 30 menit tidak boleh dipasarkan sebagai jaminan penghapusan fisik objek pada detik yang sama.
- Mode Cloud sudah mendukung banyak file dan enkripsi berbasis kunci yang **opsional**. Perilaku, kontrak API, dan pilihan enkripsi Cloud yang ada dipertahankan.
- P2P fase ini hanya untuk file. Alur catatan teks, PIN, penerimaan upload dari HP, dan fitur Cloud lain tetap memakai jalur yang ada sampai ada spesifikasi tersendiri.
- Tidak ada akun, TURN aktif, atau resume transfer yang terputus. Browser lama di luar target. STUN dipakai pada awal rilis; TURN dapat ditambahkan melalui konfigurasi tanpa mengubah protokol aplikasi.

## 3. Alur pengguna

1. Pengirim memilih satu atau beberapa file. Di area pengiriman tersedia pilihan **Langsung (P2P)** (default) dan **Simpan 30 menit (Cloud)**. Pilihan Cloud menjalankan alur yang sudah ada.
2. Pada P2P, pengirim membuat sesi dengan kode acak kriptografis minimal 8 karakter. Halaman menampilkan kode berawalan `p2p:`, tautan, QR, dan status **Menunggu perangkat lain**. Pengirim dapat menambah atau menghapus file sebelum transfer dimulai.
3. Penerima membuka tautan/QR di HP. Satu sesi menerima tepat satu penerima; perangkat tambahan mendapat pesan **Sesi sudah dipakai**. Setelah DataChannel terbuka, kedua sisi menampilkan **Terhubung**.
4. Penerima memilih tujuan simpan bila browser meminta izin. File dikirim satu per satu; kedua sisi melihat nama file, progress per file dan total, kecepatan, perkiraan waktu tersisa, serta pesan **Jangan tutup tab selama transfer**.
5. Setelah setiap file selesai diterima dan hash SHA-256 cocok, penerima melihat status **Terverifikasi dan tersimpan**. Pengirim mendapat tanda selesai setelah konfirmasi penerima, bukan hanya setelah buffer DataChannel kosong.
6. Jika koneksi langsung belum terbentuk 10 detik setelah penerima mulai mencoba tersambung, tampilkan **Gagal tersambung langsung. Kirim lewat Cloud?** beserta tombol **Kirim lewat Cloud**. File tetap terpilih; upload ke R2 **baru dimulai setelah pengirim menekan tombol**. QR/tautan diperbarui ke sesi Cloud setelah upload selesai.
7. Jika koneksi putus di tengah pengiriman, tampilkan file mana yang belum selesai. Pengirim dapat mengulang sesi P2P atau menekan tombol Cloud; fallback Cloud mengirim ulang kumpulan file yang dipilih dari awal. Pengirim harus tetap membuka tab agar `File` lokal tersedia.

## 4. Kebutuhan fungsional

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| FR1 | Pilihan P2P/Cloud di UI pengirim | Default P2P untuk file; pemilihan Cloud memakai alur Cloud saat ini. |
| FR2 | Signaling WebSocket | Worker meneruskan koneksi ke Durable Object per kode sesi; hanya pesan kontrol `join`, `offer`, `answer`, `ice`, `peer-left`, dan `error`, tanpa byte file. |
| FR3 | ICE dapat dikonfigurasi | Satu variabel env publik berisi daftar STUN/TURN untuk `RTCPeerConnection`; awalnya STUN saja. Kredensial TURN jika ditambahkan kelak tidak boleh berupa secret jangka panjang yang tertanam di frontend. |
| FR4 | Chunking dan backpressure | DataChannel ordered/reliable; default chunk 16 KiB, pengirim menunggu `bufferedAmount` turun melalui `bufferedamountlow` sebelum menambah data. |
| FR5 | Metadata dan integritas | Sebelum tiap file: nama, ukuran, MIME type, jumlah chunk, SHA-256; file 0 byte memakai 0 chunk dan hash SHA-256 konten kosong. Nama diperlakukan sebagai teks, bukan path. |
| FR6 | Banyak file | File dikirim dan disimpan berurutan dalam satu sesi; kegagalan satu file ditampilkan jelas dan tidak ditandai berhasil. |
| FR7 | Penyimpanan penerima | Utamakan penulisan bertahap ke disk melalui File System Access API; bila tidak tersedia, gunakan penyimpanan stream yang berjalan pada browser target. Blob hanya untuk file kecil (default maksimum 100 MiB). Di atas batas itu, bila tidak ada jalur stream, sarankan Cloud sebelum transfer dimulai. |
| FR8 | Verifikasi | Hash SHA-256 dihitung bertahap di kedua sisi tanpa membaca seluruh file 2 GB ke RAM. Penerima membandingkan hash setelah semua byte tertulis; hash tidak cocok berarti file korup dan tidak diberi status berhasil. |
| FR9 | Layar tetap aktif | Minta Wake Lock pada kedua sisi selama transfer bila didukung; ulangi permintaan setelah tab kembali aktif. Peringatan agar tab tidak ditutup tetap tampil karena Wake Lock tidak menjamin perangkat tidak tidur. |
| FR10 | Satu penerima | Durable Object mengunci slot penerima secara atomik dan menolak koneksi kedua; pengirim terikat ke token pengelola sesi yang terpisah dari kode penerima. |
| FR11 | Masa tunggu | Sesi P2P kedaluwarsa 10 menit setelah dibuat bila belum ada penerima. Kode yang tidak valid/kedaluwarsa mendapat pesan khusus. Sesi ditutup dan koneksi dibersihkan setelah selesai atau dibatalkan. |
| FR12 | Fallback | Setelah kegagalan koneksi 10 detik atau putus di tengah transfer, tampilkan tombol Cloud tanpa meminta pemilihan file ulang. Tidak ada upload R2 tanpa tindakan pengirim. |
| FR13 | Perangkat terbatas | Pada iOS/Safari dan file >300 MiB, tampilkan rekomendasi Cloud. Deteksi kemampuan simpan berbasis fitur browser tetap menentukan apakah P2P bisa dimulai. |
| FR14 | Kompatibilitas Cloud | Alur upload, unduh, TTL sesi, PIN, dan pilihan enkripsi Cloud tidak berubah akibat penambahan P2P. |

## 5. Arsitektur dan antarmuka

- `TransferProvider` memisahkan operasi sesi, progress, pembatalan, dan hasil transfer dari komponen UI. `P2PProvider` menangani WebRTC/signaling; `CloudProvider` membungkus alur R2 yang sudah ada. UI memakai status bersama: `idle`, `waiting`, `connecting`, `transferring`, `verifying`, `completed`, `failed`, `expired`.
- Layanan signaling dideploy terpisah di Cloudflare. Worker membuat/menemukan Durable Object berdasarkan kode sesi; Durable Object menyimpan peran pengirim/penerima, batas satu penerima, masa tunggu, dan meneruskan SDP/ICE. Gunakan WebSocket Hibernation serta state sesi yang tetap benar ketika objek tidur atau dihidupkan ulang.
- Worker membuat kode sesi memakai sumber acak kriptografis dan mengembalikan token pengirim yang tidak dimasukkan ke QR. Tautan penerima membawa kode sesi saja. Endpoint signaling memvalidasi format kode, peran, ukuran pesan, dan `Origin` yang diizinkan; pesan selain skema signaling ditolak. Server tidak menerima payload file.
- DataChannel memakai pesan kontrol terstruktur (`file-start`, `progress`, `file-end`, `file-result`, `batch-end`, `cancel`) dan frame biner untuk chunk. Setiap file mempunyai ID/urutan sehingga nama duplikat tetap aman. Penerima mengirim pengakuan jumlah byte tertulis secara berkala untuk progress pengirim; status selesai hanya setelah hasil verifikasi diterima.
- Hash pengirim dihitung secara incremental dalam pass baca sebelum `file-start`, lalu file dibaca kembali per chunk untuk pengiriman. Hash penerima dihitung saat chunk ditulis. Implementasi hash harus streaming/incremental; pemanggilan `crypto.subtle.digest` pada seluruh `ArrayBuffer` file tidak memenuhi target memori.
- Penyimpanan stream harus diperiksa berdasarkan kemampuan browser saat runtime dan diuji di Chrome Android nyata. Jika memakai StreamSaver, service worker dan halaman perantaranya di-host oleh RafQR sendiri; jangan kirim stream file ke origin pihak ketiga.
- Konfigurasi yang direncanakan: `NEXT_PUBLIC_P2P_ICE_SERVERS` (JSON daftar `RTCIceServer`), `NEXT_PUBLIC_P2P_CHUNK_BYTES` (default 16384), `NEXT_PUBLIC_P2P_CONNECT_TIMEOUT_MS` (default 10000), `NEXT_PUBLIC_P2P_WAIT_TIMEOUT_MS` (default 600000), `NEXT_PUBLIC_P2P_BLOB_MAX_MB` (default 100), `NEXT_PUBLIC_P2P_SIGNALING_URL`, dan origin frontend yang diizinkan pada Worker. Validasi nilai konfigurasi saat startup; jangan jatuh diam-diam ke konfigurasi yang tidak aman.
- Rute penerima P2P adalah `/p/[code]`, terpisah dari `/d/[id]` Cloud. Kode sesi internal berupa 16 karakter acak dari alfabet URL-safe; tampilan kode manual memakai awalan `p2p:`. Kolom buka kode di beranda mengarahkan `p2p:<code>` ke `/p/<code>` dan kode Cloud tanpa awalan ke `/d/<id>`, sehingga kode Cloud lama tetap berlaku.

## 6. Privasi, ketahanan, dan metrik

- WebRTC memakai enkripsi transport DTLS. Klaim UI cukup **file dikirim langsung antarperangkat saat P2P berhasil**; signaling tetap melewati Worker. Jangan mengklaim semua mode sebagai E2EE. Mode Cloud tetap mengikuti enkripsi opsional yang sekarang.
- Kode sesi tidak dapat ditebak secara praktis; token pengirim tidak boleh bocor ke QR, URL penerima, log, atau analytics. Signaling hanya menyimpan data sementara yang diperlukan untuk sesi. Tambahkan batas ukuran/frekuensi pesan dan jumlah koneksi sebagai dasar keamanan sebelum dibuka ke publik.
- Saat tab ditutup, perangkat tidur, izin simpan ditolak, koneksi ICE gagal, ruang disk habis, atau hash berbeda, kedua sisi melihat alasan yang bisa ditindaklanjuti. File parsial tidak boleh ditandai selesai; hapus jika API mengizinkan atau beri petunjuk menghapusnya.
- Catat metrik agregat tanpa nama atau isi file: sesi P2P dibuat, berhasil terhubung, selesai diverifikasi, gagal koneksi, dan pengguna memilih Cloud. Target >80% berhasil tersambung adalah sasaran pengukuran, bukan jaminan tanpa TURN.

## 7. Fase implementasi

- [ ] **Fase 1 — Koneksi dan file kecil:** Worker + Durable Object, kode/QR P2P, pilihan mode, koneksi satu penerima, kirim satu file kecil, dan status dasar.
- [ ] **Fase 2 — Transfer besar:** banyak file berurutan, chunk/backpressure, streaming ke disk, SHA-256 incremental, progress/kecepatan/ETA, dan uji memori 2 GB.
- [ ] **Fase 3 — Fallback dan perangkat:** tombol Cloud tanpa memilih ulang file, timeout 10 detik, Wake Lock, rekomendasi iOS/Safari, serta pesan untuk koneksi putus atau file korup.
- [ ] **Fase 4 — Jika dibuka publik:** TURN dengan kredensial sementara, rate limit lebih ketat, halaman Privasi/Syarat, dan kontak abuse.

## 8. Skenario uji dan kriteria selesai

- Chrome desktop → Chrome Android pada Wi-Fi yang sama: satu file kecil, file 0 byte, nama Unicode/karakter khusus, dua file bernama sama, dan banyak file berurutan; hasil unduhan cocok byte demi byte dengan SHA-256 sumber.
- Transfer 2 GB di Chrome desktop dan Chrome Android nyata selesai tanpa tab crash dan tanpa pemakaian RAM yang tumbuh sebanding ukuran file. Uji jalur picker/stream pada kedua perangkat sebelum menyatakan target ini terpenuhi.
- Jaringan berbeda/NAT ketat: setelah penerima mencoba selama 10 detik tanpa DataChannel terbuka, tombol Cloud muncul; sebelum tombol ditekan tidak ada PUT R2. Sesudah ditekan, file yang sama masuk alur Cloud tanpa dipilih ulang dan QR baru berfungsi.
- Peer kedua ditolak; kode salah/kedaluwarsa, pengirim menutup tab, penerima menolak izin simpan, tab di-background, disk penuh, dan hash tidak cocok menampilkan status yang benar tanpa sukses palsu.
- Mode Cloud manual dan alur lama tetap lulus uji upload, download, PIN, enkripsi opsional, serta sesi 30 menit. Build dan pemeriksaan tipe frontend maupun Worker lulus.

## 9. Keputusan produk dan risiko terbuka

- Hosting frontend saat ini adalah Vercel; signaling memakai Cloudflare Worker + Durable Object terpisah. Alamat publik signaling perlu disediakan sebelum uji lintas perangkat.
- Fallback Cloud memerlukan klik pengirim agar file tidak berpindah ke penyimpanan cloud tanpa keputusan pengguna.
- Tidak ada tambahan enkripsi Cloud dalam pekerjaan P2P ini. Bila kelak dibutuhkan klaim E2EE yang seragam, buat spesifikasi khusus untuk default enkripsi Cloud dan transfer file besar tanpa memuat seluruh file di memori.
- Tanpa TURN, sebagian jaringan tidak akan bisa P2P. Rasio kegagalan koneksi dan pemilihan fallback menentukan prioritas fase publik.
