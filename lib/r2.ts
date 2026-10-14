import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = (process.env.R2_ENDPOINT || '').trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
export const R2_BUCKET = (process.env.R2_BUCKET || 'rafqr').trim();

// The browser uploads straight to R2 with this URL, so it has to outlive the
// whole transfer — a 2 GB file on mobile data can take well over an hour.
// R2 accepts presigned URLs for up to 7 days.
const PUT_TTL = 3600; // 1 hour to complete the upload
export const GET_TTL = 1800; // 30 min download, matches session TTL

let _client: S3Client | null = null;

function client(): S3Client | null {
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

export function isR2Configured(): boolean {
  return !!client();
}

/** Object keys the app issues always live under uploads/. */
export function isValidKey(key: unknown): key is string {
  return typeof key === 'string' && /^uploads\/[A-Za-z0-9._-]+$/.test(key);
}

/** Presigned PUT URL for a browser to upload directly to R2. */
export async function presignPut(key: string, contentType?: string): Promise<string | null> {
  const c = client();
  if (!c) return null;
  return getSignedUrl(
    c,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType || 'application/octet-stream' }),
    { expiresIn: PUT_TTL },
  );
}

/** Presigned GET URL for downloading an object. */
export async function presignGet(key: string): Promise<string | null> {
  const c = client();
  if (!c) return null;
  return getSignedUrl(c, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: GET_TTL });
}

/**
 * Populate each file's `firebaseUrl` (legacy field name) with a fresh
 * presigned GET URL derived from its storageRef. Falls back to the stored
 * value when R2 isn't configured.
 */
export async function withSignedUrls<T extends { storageRef?: string; firebaseUrl?: string }>(
  files: T[] | undefined,
): Promise<T[] | undefined> {
  if (!files || files.length === 0) return files;
  if (!isR2Configured()) return files;
  return Promise.all(
    files.map(async (f) => {
      if (!f.storageRef) return f;
      const url = await presignGet(f.storageRef);
      return url ? { ...f, firebaseUrl: url } : f;
    }),
  );
}

/** Best-effort removal of blobs (explicit session delete). */
export async function removeStorageObjects(files: { storageRef?: string }[] | undefined): Promise<void> {
  const c = client();
  if (!c || !files || files.length === 0) return;
  const keys = files.map((f) => f.storageRef).filter((k): k is string => !!k);
  if (keys.length === 0) return;
  try {
    await c.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  } catch {
    // best-effort
  }
}
