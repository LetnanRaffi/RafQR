import { describe, expect, it } from 'vitest';
import { findLivePhotoPairs } from './live-photo';

describe('Live Photo file pairing', () => {
  it('pairs original photos and MOVs by basename regardless of order or case', () => {
    const names = ['IMG_1001.MOV', 'IMG_1002.HEIC', 'img_1001.heic', 'IMG_1002.mov'];
    expect(findLivePhotoPairs(names, (name) => name).map(({ photo, video }) => [photo, video])).toEqual([
      ['IMG_1002.HEIC', 'IMG_1002.mov'],
      ['img_1001.heic', 'IMG_1001.MOV'],
    ]);
  });

  it('does not label a still image without its matching MOV as a Live Photo', () => {
    expect(findLivePhotoPairs(['IMG_1001.HEIC', 'IMG_1002.MOV'], (name) => name)).toEqual([]);
  });
});
