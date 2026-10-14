'use client';

import { useEffect, useState } from 'react';

/** Stable key for a File across renders. */
const keyOf = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;

/**
 * Object URLs for image previews, keyed by file identity.
 *
 * Must not be created inline in render: every state change would mint a new
 * blob URL and orphan the previous one, which on mobile leaks memory until the
 * tab is closed.
 */
export function useFilePreviews(files: File[]): Record<string, string> {
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) { setPreviews({}); return; }

    const urls = images.map((f) => ({ key: keyOf(f), url: URL.createObjectURL(f) }));
    setPreviews(Object.fromEntries(urls.map(({ key, url }) => [key, url])));
    return () => urls.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files]);

  return previews;
}

export const fileKey = keyOf;