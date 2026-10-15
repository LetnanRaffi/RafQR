import { sha256 } from '@noble/hashes/sha2.js';

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(file: File, onChunk?: (bytes: number) => void, signal?: AbortSignal): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
    if (signal?.aborted) throw new DOMException('Transfer dibatalkan.', 'AbortError');
    const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + 1024 * 1024)).arrayBuffer());
    hash.update(chunk);
    onChunk?.(chunk.byteLength);
  }
  return hex(hash.digest());
}

export { sha256 };
