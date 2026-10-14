'use client';

/**
 * Client-side upload to Cloudflare R2 via a server-issued presigned PUT URL.
 * Keeps the same return shape as the old Supabase helper for a drop-in swap:
 *   { downloadURL, storagePath }
 * downloadURL is empty on purpose — the server mints a fresh presigned GET URL
 * at read time from storagePath (the object key).
 */
export const uploadFileToR2 = async (
  file: File | Blob,
  onProgress?: (progress: number) => void,
  customName?: string,
  signal?: AbortSignal,
): Promise<{ downloadURL: string; storagePath: string }> => {
  const rawHandle = file as any;
  const fileName = customName || rawHandle.name || 'blob';
  const contentType = file.type || 'application/octet-stream';

  // 1. Ask our server for a presigned PUT URL.
  const grantRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, fileSize: file.size }),
  });
  if (!grantRes.ok) {
    const err = await grantRes.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyiapkan upload.');
  }
  const { uploadUrl, key } = await grantRes.json();

  // 2. PUT the file straight to R2 (progress tracked via XHR).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // Budget ~1.5s per MB (≈670 KB/s floor) so a large file on a slow link is
    // not killed by a fixed deadline. Capped at 2h to avoid an eternal upload.
    const timeoutMs = Math.min(Math.max((file.size / (1024 * 1024)) * 1500, 120000), 2 * 60 * 60 * 1000);
    xhr.timeout = timeoutMs;

    const onAbort = () => xhr.abort();
    if (signal?.aborted) return reject(new DOMException('Dibatalkan', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload gagal (status ${xhr.status}).`));
    });
    xhr.addEventListener('error', () =>
      reject(new Error('Gagal upload ke R2. Cek koneksi jaringan kamu.')),
    );
    xhr.addEventListener('abort', () => reject(new DOMException('Dibatalkan', 'AbortError')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timeout. Coba lagi atau pakai file lebih kecil.')));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(file);
  });

  return { downloadURL: '', storagePath: key };
};
