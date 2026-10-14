# PRD — Redesign RafQR (Clean)

Status: Fase 1–4 selesai · Prioritas: Medium · Pemilik: RaffiTech
Referensi visual: `mockup/index.html` (19 layar, preview mobile + desktop)

## Status implementasi

Kode sudah mengikuti mockup. Checklist di §9 sudah dieksekusi; tanda `[x]` berarti layar
sudah cocok dengan mockup.

| Layar | Route | Status |
|-----------|-------|--------|
| 01 Kirim — keadaan awal | `/` | [x] |
| 02 Kirim — file dipilih | `/` | [x] |
| 03 Kirim — sedang mengirim | `/` · uploading | [x] |
| 04 Sesi aktif — QR | `/` · success | [x] |
| 05 Terima — ID penerimaan | `/` · tab Terima | [x] |
| 06 Menunggu kiriman | `/` · waiting | [x] |
| 07 Penjelasan singkat | `/` · footer sections | [x] |
| 08 Pindai QR | `/scan` | [x] |
| 09 Penerima — paket masuk | `/d/[id]` | [x] |
| 10 Penerima — pratinjau gambar | `/d/[id]` · preview | [x] |
| 11 Penerima — edit pesan | `/d/[id]` · text editing | [x] |
| 12 Penerima — terkunci PIN | `/d/[id]` · locked | [x] |
| 13 Penerima — dekripsi E2EE | `/d/[id]` · e2ee | [x] |
| 14 Penerima — sesi habis | `/d/[id]` · error | [x] |
| 15 Upload dari HP | `/u/[id]` | [x] |
| 16 Upload — sesi mati | `/u/[id]` · preflight fail | [x] |
| 17 Admin — gate akses | `/admin` | [x] |
| 18 Admin — analitik | `/admin` · login | [x] |
| 19 Debug — uji upload R2 | `/debug-upload` | [ ] **dibuang** — endpoint upload jadi terbuka tanpa auth di produksi |

### Penyimpangan yang disengaja dari mockup

1. **Batas file mengikuti backend, bukan angka di mockup.** Mockup menulis "maks 50 MB per
   file" dan "Maksimal 5 file · 250 MB per sesi". Kode memakai `lib/limits.ts`:
   `NEXT_PUBLIC_MAX_FILE_MB` (default 2 GB), `MAX_SESSION_MB` (default 10 GB). **Tidak ada
   batas jumlah file**, jadi angka itu tidak ditampilkan.
2. **Footer menyatakan kenyataan, bukan jargon.** Mockup menulis "no tracking, no analytics"
   padahal metrik dasar memang jalan. Footer sekarang menyebut RaiFFiTech Solutions dan
   truthfully menyatakan auto-hapus 30 menit.
3. **Outfit dibuang**, font memakai `system-ui` sesuai §4. Menghapus `next/font/google`
   yang fetching saat build — sumber kegagalan deploy Vercel sebelumnya.
4. **Tombol "Batalkan & bersihkan"** memakai `DELETE /api/session` untuk membuang blob yang
   sudah naik, sesuai §6.2.

> **Petunjuk utama — apa yang harus dikerjakan dari dokumen ini.**
> `mockup/index.html` adalah **spesifikasi visual**, bukan frontend yang jadi. Tugasnya: **konversi mockup tersebut
> menjadi front end aplikasi RafQR yang sungguhan** — yaitu mengganti isi `app/` (Next.js) dengan tampilan dan
> perilaku yang ada di mockup, memakai Tailwind + komponen React, bukan menyalin file HTML statis mockup ke produksi.
> Yang boleh dipertahankan dari kode sekarang: seluruh logika upload, sesi, Redis TTL, R2, E2EE, dan API route.
> Yang diganti: markup, komponen UI, token visual, dan alur interaksi sesuai mockup.
> Setiap layar di mockup memetakan ke satu route di §6. Selesaikan per fase di §9, dan tandai dengan mencentang
> mockup mana yang sudah cocok agar mockup dan kode tidak berbeda jauh.

---

## 1. Ringkasan

RafQR sekarang tampil "brutalist" — border tebal, hard shadow, tag uppercase, background bertekstur. Untuk pemakaian
pribadi itu bukan masalah, tapi karena aplikasi ini dibuka berulang tiap hari, antarmukanya perlu turun kelas: lebih tenang,
lebih ringan, dan lebih jelas (file mana yang terkirim, akan hangus kapan, selanjutnya tinggal ketuk apa).

Redesign ini tidak mengubah arsitektur maupun alur data. Yang berubah adalah **permukaan dan perilaku interaksi**.

---

## 2. Tujuan & Batas

### Tujuan
1. **Satu aksi utama per layar.** Di setiap layar, pengguna harus tahu apa yang perlu diketuk berikutnya tanpa membaca.
2. **Tos mobile benar-benar diprioritaskan** — target utama adalah "PC kirim → HP terima".
3. **Tanpa tombol ornamental** — tidak ada kontrol yang hanya ada biar tampilan terlihat ramai.
4. **Status selalu terlihat** — countdown, daftar file, dan hasil aksi (tersalin / tersimpan / gagal) selalu terlihat di layar yang sama.
5. Ganti total **Preview gambar & teks yang bisa diedit** setelah diterima.

### Tidak Goals
- Tidak ada backend/arsitektur baru. Redis, R2, dan Supabase tetap.
- Tidak ada auth/akun. Admin key tetap seperti sekarang.
- Tidak perlu real-time lewat WebSocket. Polling yang ada cukup; cukup perbaiki UX-nya (lihat §6).
- Angka dan ukuran pada mockup adalah **indeks arah**, bukan spesifikasi final.

---

## 3. Prinsip Desain

| # | Prinsip | Wujudnya di UI |
|---|---------|----------------|
| 1 | **Hierarchy, bukan dekorasi** | Tipografi besar + spasi, bukan garis tebal dan bayangan keras |
| 2 | **Satu aksi utama** | Tombol utama hitam penuh, satu saja per layar, sering di dock bawah |
| 3 | **Progressive disclosure** | Opsi (E2EE, PIN, ID kustom) tersembunyi sampai memang dibutuhkan |
| 4 | **Pesaing comprobasi** | Aksi berhasil (tersalin, tersimpan, terkirim) selalu memberi umpan balik di tempat |
| 5 | **Preview otomatis** | Format dikenali sendiri → thumbnail tampil sendiri, tanpa tombol "lihat" |
| 6 | **Editable setelah diterima** | Teks & hasil unduhan bisa dikoreksi di perangkat penerima tanpa	server trip |
| 7 | **Eksplisit soal kedaluwarsa** | Semua data punya umur; setiap layar menyebut sisa waktu |

---

## 4. Design Tokens

Ganti isi `tailwind.config.js` + `globals.css` (atau setara CSS variables). Nilai di sini titik awal, boleh di-tweak.

```css
--paper:   #FAFAF9   /* background halaman */
--surface: #FFFFFF   /* kartu, input, tombol putih */
--ink:     #111113   /* teks utama, tombol utama */
--muted:   #71717A   /* teks sekunder, placeholder */
--line:    #E9E7E3   /* garis 1px, hairline */
--line-2:  #D9D6D1   /* garis input, dashed */
--soft:    #F4F4F1   /* surface elevated / segmented background */
--accent:  #FACC15   /* kuning: logo, badge, highlights, bracket QR */
--ok:      #16A34A   /* sukses */
--danger:  #DC2626   /* gagal */

radius:  8 (kecil) / 12 (medium) / 18 (kartu) / 24 (besar)
shadow:  hanya 2 tingkat — hairline 0 1px 2px, dan kartu 0 12px 28px -18px
spacing: kelipatan 2px; jarak antar bagian 20–26px, antar item 8–12px
type:    system-ui; heading tracking negatif (-0.02em … -0.035em);
         angka ID/countdown memakai tabular numerals + font mono
```

Aturan warna:
- Kuning **tidak** dipakai sebagai warna tombol utama. Kuning = tanda (logo, badge, sorotan ID, bracket QR, progres).
- Tombol utama = ink pekat. Secondary = putih + garis 1px. Ghost = tanpa latar.
- Halaman publik terang; halaman admin tetap gelap supaya terasa seperti alat internal.

---

## 5. Komponen Dasar

Semua variasi yang tidak perlu dihapus. Daftar ini pengganti dari `components/ui.tsx` sekarang:

- **TopBar** — tinggi ~52px, sticky, blur di belakang; kiri logo + nama; kanan bisa berisi tombol aksi (Scan) atau status (countdown).
- **Card** — putih, 1px line, radius 18, shadow halus. Untuk grup kontrol, bukan tiap elemen.
- **Segmented (Kirim / Terima)** — track `--soft`, knob putih, ikon + label. Dua mode hanya, jadi segmented cukup; tidak perlu tab lain.
- **Tabs (File / Teks)** — underline, dipakai **di dalam** mode Kirim untuk memisahkan file dan catatan teks.
- **Dropzone** — dashed `--line-2`, tidak pernah thickness lebih dari 1.5px; state drag = accent border + accent-soft background.
- **FileRow** — thumbnail 58px (gambar/video) atau ikon file 38px; nama truncate satu baris; meta `ukuran · format`; aksi kanan: unduh & bagikan (ikon saja).
- **Toggle** — 42×24, knob putih, label di kiri.
- **Dock** — bar sticky di bawah pada mobile; berisi ringkasan (jumlah/ukuran) + tombol utama. Pada layout lebar dock berubah jadi statis di dalam kartu.
- **Button** — tinggi minimum 44px (mobile), 3 varian saja: `solid`, `surface`, `ghost` + `sm`/`lg`.
- **Countdown** — pill mono di TopBar, format `mm:ss`, warnai kuning, dengan titik berdenyut selama aktif.
- **Toast/inline feedback** — aksi pendek (copy, save) pakai feedback *inline* di elemennya, bukan toast global yang hilang sendiri.

---

## 6. Spesifikasi per Layar

> Deskripsi ini arah yang benar, bukan daftar piksel. Feel & hierarki yang wajibMatching.

### 6.1 Beranda — mode Kirim (`/`)
Urutan: judul pendek → kartu aksi → dock.

1. **Judul & subjudul** satu-dua baris. Tidak ada blok feature di atas fold.
2. **Kartu aksi** memuat:
   - Segmented Kirim / Terima (default Kirim).
   - Dropzone besar: "Seret file ke sini · atau klik pilih" dengan tombol `Pilih file` sebagai aksi nyata. Mendukung paste `Ctrl+V` (taruh di sini sebagai tambahan kecil).
   - Tab **File · n** dan **Teks**. Tab Teks berisi textarea pendek + tombol rekam suara sebagai chip kecil di pojok.
   - Disclosure **Opsi lanjutan** (default tertutup): E2EE (dengan generator kunci), PIN 4 digit, ID sesi kustom.
   - Batas file/ukuran selalu tertulis kecil, bukan hanya di toast.
3. **Dock sticky** dengan ringkasan "3 file · 12,5 MB" dan tombol utama `Buat sesi transfer`. Dock yang menggantikan "always-visible CTA" — wajib ada di semua layar yang butuh aksi.

### 6.2 Beranda —_state Kirim (`/`, uploading)
- Progress **per file** dengan label status (uploading / selesai / antre) dan perkiraan sisa waktu.
- Error per file (mis. >50MB) tampil sebagai baris, tidakThought memblokir seluruh batch.
- Aksi dock berubah menjadi `Batalkan & bersihkan` — jujur soal file yang sudah terlanjur naik.

### 6.3 Beranda — Sesi aktif (`/`, success)
- Countdown di TopBar.
- Split di layar lebar: kiri = status + link + aksi, kanan = QR.
- Aksi utama: **Salin tautan**. `Bagikan` dan `Simpan QR` sebagai secondary.
- Kalau polling mendeteksi file sudah diambil, tampilkan badge "Sudah diterima" di atas.
- Blok kunci E2EE (kalau aktif) ditampilkan jelas sebagai "kirim terpisah".
- Hapus kontrol warna QR dari UI utama — cukup tombol `Simpan QR`. Kalau tetap ada, harus tersembunyi.

### 6.4 Beranda — mode Terima (`/`, tab Terima)
- ID penerimaan jadi elemen utama: besar, mono, mudah disalin; tombol `Salin` dan `ID baru` di dekatnya.
-_Opsi ID kustom tetap ada tapi di bawah, dengan label yang menjelaskan kapan perlu dipakai ("recipient mengetik, bukan scan").
- Tombol dock `Aktifkan penerimaan`.
- Setelah aktif → state menunggu (6.5).

### 6.5 Beranda — Menunggu kiriman (`/`, waiting)
- Status `Menunggu pengirim` yang jelas + countdown.
- QR + link (untuk dikirim ke pengirim), tombol berhenti menerima selalu tersedia.
- Cara hemat baterai: poll 3 detik, hentikan polling saat tab tidak terlihat (`visibilitychange`), resume saat kembali. Ini perbaikan kecil yang layak.

### 6.6 Pindai (`/scan`)
- Kamera adalah isi utama; fallback "ketik kode sesi" menempel di bawah (bukan dialog).
- Tombol kembali di kiri, `Dari galeri` opsional di kanan (bisa ditunda).
- Error QR tidakvalid inline, tanpa pindah halaman; scanner tetap mencoba.

### 6.7 Terima Data (`/d/[id]`)
- Judul: ringkasan paket ("3 file dari PC"), bukan "Paket diterima".
- **Preview otomatis**: gambar → thumbnail inline di baris; video → thumbnail + ikon play + durasi; audio → ikon pemutar; dokumen → ikon format. Tidak ada tombol "pratinjau".
- Ketuk thumbnail (opsional) → layar penuh: tutup jelas di kiri atas, nama + ukuran, navigasi file (`1/3`), Unduh/Bagikan. Ini bonus, bukan langkah wajib.
- Blok **Pesan** dengan dua mode:
  - *view*: teks ditampilkan apa adanya + `Salin`.
  - *edit*: textarea + `Batal` / `Simpan perubahan`, count karakter, indikator "Tersimpan".
  - Hasil edit disimpan **di perangkat penerima** (localStorage / IndexedDB), tidak pernah dikirim ke server. Ditulis eksplisit di UI agar tidak menyesatkan.
  - Ekspor teks: `Salin teks` dan `Bagikan .txt`.
- `Unduh semua (.zip)` menjadi tombol kecil di kanan judul; jadi aksi sekunder, bukan tombol besar.
- Footer/dock menyebut sisa waktu sesi, dengan aksi yang tidak menggantungkan pengguna (mis. "File tetap di perangkat saya").

### 6.8 Terkunci PIN & E2EE (`/d/[id]`)
- PIN: empat kotak terpisah, auto-lanjut, paste 4 digit diterima langsung. Pesan error pendek, tidak menyalahkan pengguna.
- E2EE: penjelasan 1–2 kalimat sebelum input (kunci dikirim terpisah oleh pengirim), lalu input kunci + tombol dekripsi. Janji "kunci tidak pernah meninggalkan perangkat" dekat dengan input, bukan di footer.

### 6.9 Sesi habis (`/d/[id]`, 404)
- 404 pendek + penjelasan kenapa + **jalan keluar**: minta sesi baru / kembali ke beranda. Tidak pernah layar kosong.

### 6.10 Upload dari HP (`/u/[id]`)
- one-liner: "Kirim ke PC · sesi QM82LP".
- Dropzone besar (kamera/galeri native di mobile), daftar file sebagai baris, textarea opsional.
- Preflight: sebelum interaksi dibuka, cek sesi masih hidup. Mati → banner + CTA untuk scan ulang, dan **input dimatikan** supaya tidak ada file besar terbuang sia-sia.
- Dock berisi ringkasan + `Kirim ke PC sekarang`.

### 6.11 Admin (`/admin`)
- Tetap gelap, tapi tenang: kartu 16px, angka besar tanpa italic tipis, grafik batang sederhana.
- Login cukup satu field + satu tombol, tanpa "VERIFY IDENTITY" dramatis.
- Isi: 4 KPI, grafik 7 hari, satu kalimat asal data. Tidak ada navigasi lain.

### 6.12 Debug (`/debug-upload`)
- Tetap satu halaman tanpa navigasi. Urutannya: pilih file → status + progress → log mono → checklist. Tidak ada perubahan visual besar.

---

## 7. Detail Perilaku (wajib dijaga)

1. **Minimum tap target 44px** untuk semua yang dipakai di mobile. Ikon di baris file minimal 38×38 dengan area sentuh diperluas.
2. **Dock sticky** hanya di bawah lebar 620px. Di layar lebar, CTA kembali ke dalam kartu.
3. **Tidak ada toasts untuk aksi yang punya elemennya** — feedback copy/save tampil di elemen yang sama (ikon berubah menjadi centang selama ~2 detik).
4. **Semua batas (ukuran, jumlah file, masa berlaku) ditulis sebelum user salah**, bukan setelah.
5. **Tidak ada state yang hanya "loading"** — selalu ada teks yang menjelaskan apa yang sedang terjadi.
6. **Warna bukan satu-satunya penanda** (aksesibilitas): status punya ikon + teks.
7. **`prefers-reduced-motion`** tetap dihormati; tidak ada animasi wajib untuk memahami UI.
8. **Dark-on-light** untuk halaman publik dengan rasio kontras teks utama ≥ 7:1; teks sekunder ≥ 4.5:1; indikator non-teks ≥ 3:1.

---

## 8. Catatan Implementasi

- **Mockup adalah acuan, kode sekarang adalah bahan.** Saat mengerjakan, buka `mockup/index.html` di browser untuk
  membandingkan tampilan target, lalu ubah kode di `app/` sampai cocok. Jangan menyalin HTML mockup mentah ke komponen —
  mockup sengaja dibuat dengan CSS terpisah supaya tidak ikut ter-build ke aplikasi.
- Semua komponen baru masuk ke `components/ui.tsx` (atau dipecah kalau memang sudah menumpuk: `components/ui/`), lalu dipakai ulang oleh `app/page.tsx`, `app/d/[id]/page.tsx`, `app/u/[id]/page.tsx`, `app/scan/page.tsx`, `app/admin/page.tsx`.
- `globals.css` + `tailwind.config.js`: ganti palet & shadow lama dengan token di §4. Kelas `neo-*` dihapus setelah semua halaman migrasi — jangan ada dua sistem gaya hidup berdampingan.
- **Preview file**: hapus state `previews` manual. Render langsung dari URL blob:
  - `image/*` → `<img>` di dalam row (lazy, `decoding="async"`).
  - `video/*` → `<video muted preload="metadata">` + overlay durasi.
  - `audio/*` → pemutar ringkas satu baris.
  - Careful: file E2EE harus didekripsi dulu sebelum URL-nya bisa dipakai.
- **Edit teks**: `useState` + tulis ke `localStorage` dengan key per sesi id (mis. `rafqr_text_<id>`). Jangan pernah POST ke server. Restorasi saat halaman dibuka lagi.
- **Polling**: setback ke idle saat `document.hidden`, dan berhenti di state sukses setelah data terkonfirmasi.
- **Layout**: pakai `dvh`/sticky yang aman untuk iOS Safari; hindari `100vh` untuk area dock.

---

## 9. Tahapan Pengerjaan

| Fase | Isi | Nilai | Status |
|------|-----|-------|--------|
| 1 | Token + komponen dasar + layout shell (TopBar, Dock, Card, FileRow) | Semua halaman langsung terlihat "clean" | [x] |
| 2 | Beranda (Kirim/Terima/waiting/success) + Upload HP | Alur inti selesai | [x] |
| 3 | Terima Data: preview otomatis + edit pesan + PIN/E2EE/404 | Alur recipient selesai | [x] |
| 4 | Scan + Admin (+ Debug, dibuang) | Sisa halaman | [x] |
| 5 | Polish: animasi, micro-interaction, uji keypad & iOS Safari | Halus | [ ] |

Fase 1–2 sudah menghasilkan manfaat sendiri, jadi kalau berhenti di tengah tetap valuable.

---

## 10. Di Luar Scope

- Multi-file resume/antar sesi.
- Riwayat permanen (server) — tetap lokal per perangkat.
- Drag file antar browser (multi-device sync).
- Encryption key escrow / recovery.

---

## 11. Pertanyaan Terbuka

1. Batas file per sesi masih 5 file / 250 MB,  atau lamakan dengan feeling? (Mockup memakai angka yang sama dengan app sekarang.)
2. Countdown di TopBar: cukup, atau perlu layar "waktu hampir habis" (mis. sisa < 2 menit)?
3. Edit teks: perlu tombol undo/redo? (Untuk pemakaian pribadi, ctrl+Z bawaan browser mungkin cukup.)
4. Mode Terima masih dipakai, atau mostly Kirim? Kalau jarang, pertimbangkan Terima sebagai halaman terpisah, bukan tab.
5. Apakah admin masih dipakai? Kalau tidak, hapus saja dari navigasi dan cukup jadi route tersembunyi.