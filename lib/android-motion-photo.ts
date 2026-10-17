const XMP_HEADER = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0');

export function androidMotionPhotoName(name: string): string {
  const base = name.replace(/\.(heic|heif|jpe?g)$/i, '').replace(/MP$/i, '').replace(/[\s/\\]+/g, '_');
  return `${base}MP.jpg`;
}

function isXmp(bytes: Uint8Array, start: number): boolean {
  return XMP_HEADER.every((byte, index) => bytes[start + index] === byte);
}

function jpegWithoutOldXmp(bytes: Uint8Array): Uint8Array[] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Foto bukan JPEG yang valid.');
  const parts: Uint8Array[] = [];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('Struktur JPEG tidak valid.');
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.subarray(offset));
      return parts;
    }
    if (!marker || marker === 0xff || offset + 4 > bytes.length) throw new Error('Struktur JPEG tidak valid.');
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error('Struktur JPEG tidak valid.');
    if (marker !== 0xe1 || !isXmp(bytes, offset + 4)) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  throw new Error('Data JPEG tidak lengkap.');
}

/** Android Motion Photo 1.0: XMP directory in JPEG APP1, followed by the unmodified MOV bytes. */
export async function buildAndroidMotionPhoto(jpeg: Blob, video: Blob, name: string): Promise<File> {
  if (!video.size) throw new Error('Video Live Photo kosong.');
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const imageParts = jpegWithoutOldXmp(bytes);
  const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Camera="http://ns.google.com/photos/1.0/camera/" xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/" Camera:MotionPhoto="1" Camera:MotionPhotoVersion="1"><Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource" Item:Mime="image/jpeg" Item:Semantic="Primary"/><rdf:li rdf:parseType="Resource" Item:Mime="video/quicktime" Item:Semantic="MotionPhoto" Item:Length="${video.size}"/></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const packet = new TextEncoder().encode(xml);
  const length = XMP_HEADER.length + packet.length + 2;
  if (length > 65535) throw new Error('Metadata Motion Photo terlalu besar.');
  const segment = new Uint8Array(4 + XMP_HEADER.length + packet.length);
  segment.set([0xff, 0xe1, length >> 8, length & 0xff]);
  segment.set(XMP_HEADER, 4);
  segment.set(packet, 4 + XMP_HEADER.length);
  return new File([Uint8Array.from(bytes.subarray(0, 2)), segment, ...imageParts.map((part) => Uint8Array.from(part)), video], androidMotionPhotoName(name), { type: 'image/jpeg' });
}

export async function createAndroidMotionPhoto(photo: File, video: File): Promise<File> {
  if (/\.jpe?g$/i.test(photo.name)) return buildAndroidMotionPhoto(photo, video, photo.name);
  if (!/\.(heic|heif)$/i.test(photo.name)) throw new Error('Format foto tidak didukung untuk Motion Photo Android.');
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  try {
    let source: CanvasImageSource;
    let width: number;
    let height: number;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(photo); } catch { /* Try the browser image decoder below. */ }
    }
    if (bitmap) {
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(photo);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    }
    if (!width || !height) throw new Error('Browser tidak bisa membaca foto HEIC.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser tidak bisa mengubah foto HEIC ke JPEG.');
    context.drawImage(source, 0, 0);
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Gagal membuat JPEG.')), 'image/jpeg', 0.95));
    return buildAndroidMotionPhoto(jpeg, video, photo.name);
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
