const PHOTO_EXTENSIONS = new Set(['heic', 'heif', 'jpg', 'jpeg']);

function parts(name: string): { base: string; extension: string } | null {
  const dot = name.lastIndexOf('.');
  if (dot < 1) return null;
  return { base: name.slice(0, dot).toLowerCase(), extension: name.slice(dot + 1).toLowerCase() };
}

export function findLivePhotoPairs<T>(items: T[], nameOf: (item: T) => string): { photo: T; video: T; name: string }[] {
  const videos = new Map<string, T[]>();
  for (const item of items) {
    const file = parts(nameOf(item));
    if (file?.extension !== 'mov') continue;
    videos.set(file.base, [...(videos.get(file.base) || []), item]);
  }
  const pairs: { photo: T; video: T; name: string }[] = [];
  for (const item of items) {
    const file = parts(nameOf(item));
    if (!file || !PHOTO_EXTENSIONS.has(file.extension)) continue;
    const video = videos.get(file.base)?.shift();
    if (video) pairs.push({ photo: item, video, name: nameOf(item).slice(0, nameOf(item).lastIndexOf('.')) });
  }
  return pairs;
}
