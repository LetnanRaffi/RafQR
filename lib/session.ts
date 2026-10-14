/** Client-side helpers shared by the upload flows on `/` and `/u/[id]`. */

export { MAX_FILE_BYTES } from './limits';

/** Delete storage objects that were uploaded but never made it into a session. */
export const purgeUploads = async (storageRefs: string[]): Promise<void> => {
  if (storageRefs.length === 0) return;
  try {
    await fetch('/api/session', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageRefs }),
    });
  } catch {
    // best-effort; R2 lifecycle rules are the backstop
  }
};

/** Fire-and-forget analytics. Never blocks or surfaces to the user. */
export const trackTransfer = (sessionId: string, files: { fileName: string; fileSize: number }[]): void => {
  const payload = files.length > 0 ? files : [{ fileName: 'text', fileSize: 0 }];
  payload.forEach((f) => {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'transfer', fileId: sessionId, fileSize: f.fileSize, fileName: f.fileName }),
    }).catch(() => {});
  });
};

export const trackVisit = (): void => {
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'visit' }),
  }).catch(() => {});
};