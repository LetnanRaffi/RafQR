import { describe, expect, it } from 'vitest';
import { hashFile } from './hash';

describe('P2P incremental SHA-256', () => {
  it('hashes a zero-byte file', async () => {
    expect(await hashFile(new File([], 'kosong.txt'))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes chunks across the 1 MiB read boundary without buffering the whole file', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 7);
    bytes.fill(97);
    const file = new File([bytes], 'besar.bin');
    let observed = 0;
    const actual = await hashFile(file, amount => { observed += amount; });
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    expect(actual).toBe(expected);
    expect(observed).toBe(bytes.byteLength);
  });
});
