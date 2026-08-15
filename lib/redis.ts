import { Redis } from '@upstash/redis';

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Individual file in a session
export interface SessionFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
  storageRef: string;
}

// Full session with multiple files
export interface FileSession {
  files?: SessionFile[];
  textContent?: string;
  createdAt: number;
  totalSize: number;
  fileCount: number;
  
  // New Features v3.0
  ghost?: boolean;      // Self-destruct after first scan
  pin?: string;         // Password protection
  isDownloaded?: boolean; // Tracking for PC notifications
  e2ee?: boolean;       // v3.5 E2EE
}

// Create a new file session in Redis
export const createFileSession = async (
  uniqueId: string,
  sessionData: FileSession,
  ttlSeconds: number = 1800
): Promise<void> => {
  const key = `file:${uniqueId}`;
  await redis.set(key, sessionData, { ex: ttlSeconds });
};

// Get file session from Redis
export const getFileSession = async (uniqueId: string): Promise<FileSession | null> => {
  const key = `file:${uniqueId}`;
  const data = await redis.get<FileSession>(key);
  return data;
};

// Get TTL remaining for a session
export const getSessionTTL = async (uniqueId: string): Promise<number> => {
  const key = `file:${uniqueId}`;
  const ttl = await redis.ttl(key);
  return ttl;
};

// Delete file session from Redis
export const deleteFileSession = async (uniqueId: string): Promise<void> => {
  const key = `file:${uniqueId}`;
  await redis.del(key);
};

// Atomic "claim" of a session id. Returns false if the id is already taken.
export const claimFileSession = async (
  uniqueId: string,
  sessionData: FileSession,
  ttlSeconds: number = 1800,
): Promise<boolean> => {
  const key = `file:${uniqueId}`;
  const res = await redis.set(key, sessionData, { ex: ttlSeconds, nx: true });
  return res === 'OK';
};

/**
 * Fixed-window rate limiter backed by Redis. Returns true when allowed.
 * Fails open (allowed) if Redis errors, to avoid blocking legit traffic.
 */
export const rateLimit = async (
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> => {
  try {
    const key = `rl:${bucket}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= limit;
  } catch {
    return true;
  }
};

export { redis };
