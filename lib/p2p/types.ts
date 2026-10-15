export type P2PStatus = 'idle' | 'waiting' | 'connecting' | 'connected' | 'transferring' | 'verifying' | 'completed' | 'failed' | 'expired';

export interface P2PFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  index: number;
  total: number;
  sha256: string;
}

export interface P2PProgress {
  fileId: string;
  transferredBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  direction: 'send' | 'receive';
  overallTransferredBytes: number;
  overallBytes: number;
}

export interface P2PFileResult {
  fileId: string;
  ok: boolean;
  error?: string;
}

export interface P2PSessionInfo {
  code: string;
  url: string;
  expiresAt: number;
}

export interface P2PCallbacks {
  onSession?: (session: P2PSessionInfo) => void;
  onStatus?: (status: P2PStatus) => void;
  onFile?: (file: P2PFileInfo) => void;
  onProgress?: (progress: P2PProgress) => void;
  onFileResult?: (result: P2PFileResult) => void;
  onError?: (error: Error) => void;
}
