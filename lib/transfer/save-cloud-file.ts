'use client';

interface PickerWindow extends Window {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
}

/** Stream a presigned R2 response directly to the user's chosen file. */
export async function streamSaveCloudFile(url: string, name: string): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) throw new Error('Browser ini tidak mendukung unduhan file besar secara streaming. Buka di Chrome terbaru.');
  // The picker must open in the original click task, before network awaits.
  const handle = await picker.call(window, { suggestedName: name });
  const writable = await handle.createWritable();
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error('Berkas sudah kedaluwarsa atau dibatalkan.');
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value as BufferSource);
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}
