import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAndroidMotionPhoto } from './android-motion-photo';

const JPEG = readFileSync(new URL('./fixtures/live-photo-still.jpg', import.meta.url));

describe('Android Motion Photo', () => {
  it('embeds a Motion Photo XMP directory and appends the MOV intact', async () => {
    const mov = new Blob([Uint8Array.from([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70])]);
    const result = await buildAndroidMotionPhoto(new Blob([JPEG], { type: 'image/jpeg' }), mov, 'IMG_1234.JPG');
    const bytes = new Uint8Array(await result.arrayBuffer());
    const text = new TextDecoder().decode(bytes.subarray(0, 1000));
    expect(result.name).toBe('IMG_1234MP.jpg');
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(text).toContain('Camera:MotionPhoto="1"');
    expect(text).toContain('Item:Semantic="MotionPhoto" Item:Length="8"');
    expect(Array.from(bytes.subarray(-8))).toEqual([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]);
  });
});
