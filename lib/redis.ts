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
  files: SessionFile[];
  createdAt: number;
  totalSize: number;
  fileCount: number;
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

export { redis };
