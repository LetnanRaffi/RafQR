📄 System Prompt & PRD: TempShare (Next.js + Firebase + Redis)
1. Project Context
Kamu adalah Senior Full-Stack Developer. Tugas kamu adalah membangun aplikasi web bernama TempShare, sebuah platform transfer file peer-to-peer (PC ke Mobile) menggunakan sistem QR Code.
Fokus utama adalah kecepatan, efisiensi, dan zero-maintenance. File hanya disimpan sementara dan akan otomatis hangus (TTL).

2. Tech Stack & Environment
Framework: Next.js 14/15 (App Router)

Styling: Tailwind CSS (UI sudah tersedia, tinggal di-convert ke JSX/React Components)

Storage (Files): Firebase Storage (menggunakan firebase/app dan firebase/storage)

Database (Session & QR State): Upstash Redis (menggunakan @upstash/redis)

QR Generator: react-qr-code atau qrcode.react

State Management/File Handling: React Hooks (useState, useRef) atau react-dropzone.

3. Current State & Assets
User sudah memiliki raw HTML + Tailwind CSS untuk 2 halaman utama:

Halaman Upload (PC): Memiliki area drag-and-drop dan progress bar.

Halaman Download (Mobile): Memiliki detail file dan tombol download.

Tugas Pertama Kamu: Mengubah raw HTML tersebut menjadi komponen Next.js (page.tsx) yang interaktif dan memisahkan komponen yang reusable jika diperlukan. Pastikan direktif "use client" digunakan dengan tepat.

4. Core Architecture & User Flow
Phase A: Upload (Frontend ke Firebase)
User memilih atau men-drag file di halaman utama.

Gunakan Firebase Storage Client SDK (uploadBytesResumable) untuk mengunggah file langsung dari browser (Client-side) ke Firebase Storage. Jangan kirim file ke API Route Next.js untuk menghemat bandwidth server.

Tampilkan progress bar di UI secara real-time sesuai data dari uploadBytesResumable.

Setelah upload 100% dan mendapatkan downloadURL dari Firebase, panggil API Route Next.js (POST /api/session).

Phase B: Session Creation (API Route & Redis)
Buat endpoint POST /api/session.

Menerima payload: fileName, fileSize, fileType, firebaseUrl, dan firebaseStorageRef.

Generate uniqueId (misal menggunakan nanoid atau UUID).

Simpan ke Upstash Redis dengan key file:${uniqueId} dan set TTL (Time To Live) 1800 detik (30 Menit).

Kembalikan uniqueId ke frontend.

Frontend merender QR Code yang berisi URL: https://[domain]/d/[uniqueId].

Phase C: Download (Mobile View)
User melakukan scan QR dan diarahkan ke Dynamic Route app/d/[id]/page.tsx.

Halaman ini melakukan fetch ke GET /api/session?id=[uniqueId].

Jika data ada di Redis: Tampilkan UI Download beserta nama file dan ukurannya.

Jika data tidak ada/expired: Tampilkan UI "File Not Found / Expired".

Saat tombol ditekan, trigger download menggunakan firebaseUrl.

5. Database Schema (Upstash Redis)
Format penyimpanan data (JSON String):

JSON
Key: file:{uniqueId}
Value: {
  "fileName": "dokumen.pdf",
  "fileSize": 2048576,
  "firebaseUrl": "https://firebasestorage.googleapis.com/v0/b/...",
  "storageRef": "uploads/1711296000_dokumen.pdf",
  "createdAt": 1711296000
}
TTL: 1800
6. Execution Steps (Instruksi untuk Qwen)
Tolong kerjakan secara bertahap. Mulailah dengan Step 1 dan Step 2 terlebih dahulu, berikan kodenya, dan tunggu instruksi selanjutnya.

Step 1: Buatkan struktur file dan konfigurasi awal (contoh lib/firebase.ts dan lib/redis.ts) menggunakan environment variables.

Step 2: Konversi HTML Halaman Utama (Upload) yang akan saya berikan setelah pesan ini menjadi app/page.tsx. Integrasikan fungsi drag-and-drop dan upload langsung ke Firebase Storage.

Step 3: Buat API Route app/api/session/route.ts untuk menyimpan data ke Upstash Redis.

Step 4: Konversi HTML Halaman Download menjadi app/d/[id]/page.tsx dan integrasikan pembacaan data dari Redis.