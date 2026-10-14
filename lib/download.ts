'use client';

/**
 * Saving a file on a phone is not a download, it is a share.
 *
 * `file-saver`'s saveAs() uses an <a download> + blob URL. iOS Safari has no
 * download manager for that, and an installed PWA (display: standalone) has no
 * download UI at all — the tap does nothing visible. Web Share Level 2 is the
 * only path that reliably saves to Files on iOS and works in standalone mode.
 */
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

/** Share if the platform can take it, otherwise fall back to a normal save. */
export async function saveOrShare(blob: Blob, name: string, fallback: () => void): Promise<void> {
  if (canShareFiles()) {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  }
  fallback();
}