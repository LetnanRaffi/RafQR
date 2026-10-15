export interface FileSink {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface PickerWindow extends Window {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
}

export async function createFileSink(name: string, size: number, type: string, blobMaxBytes: number): Promise<FileSink> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    // Keep this call before the first await so browser user activation is preserved.
    const handlePromise = picker.call(window, { suggestedName: name });
    const handle = await handlePromise;
    const writable = await handle.createWritable();
    return {
      async write(bytes) { await writable.write(bytes as BufferSource); },
      async close() { await writable.close(); },
      async abort() { await writable.abort(); },
    };
  }
  if (size > blobMaxBytes) throw new Error('Browser ini tidak mendukung simpan file besar secara streaming. Gunakan mode Cloud.');
  const pieces: BlobPart[] = [];
  let saved = false;
  return {
    async write(bytes) { pieces.push(bytes.slice().buffer); },
    async close() {
      const url = URL.createObjectURL(new Blob(pieces, { type: type || 'application/octet-stream' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      saved = true;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    async abort() { if (!saved) pieces.length = 0; },
  };
}
