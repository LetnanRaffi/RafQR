'use client';

import { useState } from 'react';
import { findLivePhotoPairs } from '../lib/live-photo';
import { androidMotionPhotoName, createAndroidMotionPhoto } from '../lib/android-motion-photo';
import { MAX_FILE_BYTES } from '../lib/session';

export default function LivePhotoHint({ files, onAddFiles }: { files: File[]; onAddFiles: (files: File[]) => void }) {
  const [making, setMaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pairs = findLivePhotoPairs(files, (file) => file.name);
  const create = async (photo: File, video: File) => {
    setMaking(photo.name);
    setError(null);
    try {
      const result = await createAndroidMotionPhoto(photo, video);
      if (result.size > MAX_FILE_BYTES) throw new Error('Motion Photo melebihi batas ukuran file. Kirim pasangan aslinya saja.');
      onAddFiles([result]);
    } catch (next) {
      setError((next as Error).message || 'Gagal membuat Motion Photo Android.');
    } finally {
      setMaking(null);
    }
  };
  if (pairs.length > 0) return <div className="live-photo-hint"><strong>Live Photo:</strong> {pairs.length} pasangan foto + MOV siap dikirim. Kedua file terpilih akan dikirim utuh.
    {pairs.map(({ photo, video, name }) => {
      const outputName = androidMotionPhotoName(photo.name);
      return files.some((file) => file.name.toLowerCase() === outputName.toLowerCase())
        ? <p key={name}>Motion Photo Android siap: {outputName}</p>
        : <button key={name} type="button" className="btn white sm live-photo-create" disabled={making !== null} onClick={() => { void create(photo, video); }}>{making === photo.name ? 'Membuat…' : `Buat Motion Photo Android · ${name}`}</button>;
    })}
    <p>File Android dibuat dari foto JPEG dan video .MOV. Foto HEIC dikonversi ke JPEG; file HEIC dan .MOV asli tetap ikut.</p>
    {error && <p className="err" role="alert">{error}</p>}
  </div>;
  if (files.some((file) => /\.(heic|heif|jpe?g)$/i.test(file.name))) return <p className="live-photo-hint"><strong>Jika ini Live Photo, geraknya belum ikut.</strong> Pilihan dari galeri Foto iPhone bisa hanya berisi gambar. Di Foto, pilih Bagikan → Ekspor Original Tidak Dimodifikasi ke File, lalu pilih foto dan .MOV bernama sama dari File.</p>;
  return <details className="live-photo-hint"><summary>Kirim Live Photo dari iPhone</summary><p>Di Foto, ekspor Original Tidak Dimodifikasi ke File. Pilih foto (.HEIC/.JPG) dan video .MOV dengan nama sama. Memilih foto saja tidak membawa geraknya.</p></details>;
}
