'use client';

/** Whether the browser can share a file through the native share sheet. */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    // canShare rejects on some engines when handed a zero-byte file of an
    // exotic type, so probe with a plain small one.
    return navigator.canShare({ files: [new File(['.'], 'probe.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

/** Only called by an explicit Bagikan action. */
export async function shareFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (!navigator.canShare?.({ files: [file] })) throw new Error('Browser ini tidak mendukung berbagi file.');
  await navigator.share({ files: [file], title: name });
}
