/**
 * Upload limits. Single source of truth — imported by both the client upload
 * screens (for the pre-flight size hint) and the API routes (which enforce).
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
 * changing them on Vercel requires a redeploy. MAX_SESSION_MB is server-only
 * and resolved at request time.
 */

export const MAX_FILE_BYTES = Number(process.env.NEXT_PUBLIC_MAX_FILE_MB ?? 2048) * 1024 * 1024;
export const MAX_TOTAL_BYTES = Number(process.env.MAX_SESSION_MB ?? 10240) * 1024 * 1024;

/**
 * JSZip holds the whole session in RAM, so this is a memory ceiling, not a
 * transfer limit. Above it we offer per-file downloads instead of a zip.
 */
export const MAX_ZIP_BYTES = Number(process.env.NEXT_PUBLIC_MAX_ZIP_MB ?? 512) * 1024 * 1024;

export const formatLimit = (bytes: number): string =>
  bytes >= 1024 * 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024 * 1024))} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;