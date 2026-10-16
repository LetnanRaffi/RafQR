import { nanoid } from 'nanoid';
import { encryptData } from '../crypto';
import { uploadFileToR2 } from '../r2-client';
import { purgeUploads, trackTransfer } from '../session';
import type { TransferProvider } from './types';

export interface CloudFile {
  key: string;
  file: File;
}

export interface CloudFileResult {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
  storageRef: string;
}

export type CloudEvent =
  | { type: 'file-start'; key: string }
  | { type: 'file-progress'; key: string; percent: number }
  | { type: 'file-done'; key: string }
  | { type: 'file-error'; key: string; message: string }
  | { type: 'finalizing' };

export interface CloudSendInput {
  files: CloudFile[];
  textContent: string;
  pin?: string;
  encryptionKey?: string;
  customId?: string;
}

export interface CloudSendResult {
  id: string;
  uploaded: CloudFileResult[];
  failedKeys: string[];
}

/** Existing R2 behavior behind a provider that the sender UI can reuse for fallback. */
export class CloudProvider implements TransferProvider {
  readonly mode = 'cloud';
  private readonly controller = new AbortController();

  cancel(): void {
    this.controller.abort();
  }

  async send(input: CloudSendInput, emit: (event: CloudEvent) => void): Promise<CloudSendResult> {
    const uploaded: CloudFileResult[] = [];
    const failedKeys: string[] = [];
    try {
      for (const { key, file } of input.files) {
        if (this.controller.signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
        emit({ type: 'file-start', key });
        try {
          const blob = input.encryptionKey ? await encryptData(file, input.encryptionKey) : file;
          if (this.controller.signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
          const { downloadURL, storagePath } = await uploadFileToR2(
            blob,
            (percent) => emit({ type: 'file-progress', key, percent }),
            file.name,
            this.controller.signal,
          );
          uploaded.push({
            fileName: file.name,
            fileSize: blob.size,
            fileType: file.type,
            firebaseUrl: downloadURL,
            storageRef: storagePath,
          });
          emit({ type: 'file-done', key });
        } catch (error) {
          if ((error as Error).name === 'AbortError') throw error;
          failedKeys.push(key);
          emit({ type: 'file-error', key, message: (error as Error).message });
        }
      }

      if (this.controller.signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      if (uploaded.length === 0 && !input.textContent.trim()) {
        throw new Error('Semua file gagal diunggah. Coba lagi.');
      }

      emit({ type: 'finalizing' });
      const id = input.customId?.trim() || nanoid(10);
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          files: uploaded.length > 0 ? uploaded : undefined,
          textContent: input.textContent.trim() || undefined,
          pin: input.pin,
          e2ee: !!input.encryptionKey,
        }),
        signal: this.controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Gagal membuat sesi.');
      }

      trackTransfer(id, uploaded.length > 0
        ? uploaded
        : [{ fileName: 'Pesan teks', fileSize: new Blob([input.textContent]).size }]);
      return { id, uploaded, failedKeys };
    } catch (error) {
      await purgeUploads(uploaded.map((file) => file.storageRef));
      throw error;
    }
  }
}
