export interface P2PConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  chunkBytes: number;
  connectTimeoutMs: number;
  blobMaxBytes: number;
}

function integerSetting(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Konfigurasi P2P tidak valid: ${value}`);
  return parsed;
}

export function getP2PConfig(): P2PConfig {
  const signalingUrl = process.env.NEXT_PUBLIC_P2P_SIGNALING_URL?.replace(/\/$/, '') || '';
  if (!/^https?:\/\//.test(signalingUrl)) throw new Error('NEXT_PUBLIC_P2P_SIGNALING_URL belum dikonfigurasi.');
  let iceServers: RTCIceServer[];
  try {
    iceServers = JSON.parse(process.env.NEXT_PUBLIC_P2P_ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]') as RTCIceServer[];
    if (!Array.isArray(iceServers) || iceServers.length === 0 || iceServers.some(server => !server || !server.urls)) throw new Error();
  } catch {
    throw new Error('NEXT_PUBLIC_P2P_ICE_SERVERS harus berupa JSON daftar ICE server.');
  }
  return {
    signalingUrl,
    iceServers,
    chunkBytes: integerSetting(process.env.NEXT_PUBLIC_P2P_CHUNK_BYTES, 16 * 1024, 1024, 64 * 1024),
    connectTimeoutMs: integerSetting(process.env.NEXT_PUBLIC_P2P_CONNECT_TIMEOUT_MS, 10_000, 1000, 120_000),
    blobMaxBytes: integerSetting(process.env.NEXT_PUBLIC_P2P_BLOB_MAX_MB, 100, 1, 300) * 1024 * 1024,
  };
}
