import { getP2PConfig, type P2PConfig } from './config';
import { hashFile, hex, sha256 } from './hash';
import { createFileSink, type FileSink } from './sink';
import { TransferWakeLock } from './wake-lock';
import type { P2PCallbacks, P2PFileInfo, P2PFileResult, P2PProgress, P2PSessionInfo, P2PStatus } from './types';
import type { TransferProvider } from '../transfer/types';

type Role = 'sender' | 'receiver';
type ControlMessage =
  | { type: 'file-start'; file: P2PFileInfo; batchBytes: number }
  | { type: 'file-ready'; fileId: string }
  | { type: 'file-end'; fileId: string }
  | { type: 'file-result'; fileId: string; ok: boolean; error?: string }
  | { type: 'ack'; fileId: string; bytes: number }
  | { type: 'batch-end' }
  | { type: 'cancel'; reason?: string };

interface ReceivingFile {
  info: P2PFileInfo;
  sink: FileSink | null;
  received: number;
  acknowledged: number;
  hash: ReturnType<typeof sha256.create>;
  startedAt: number;
  completed: boolean;
}

interface Waiter<T> { resolve(value: T): void; reject(reason: Error): void; }

const ACK_INTERVAL = 256 * 1024;
const SEND_WINDOW = 1024 * 1024;
const CHANNEL_HIGH_WATER = 1024 * 1024;
const CHANNEL_LOW_WATER = 256 * 1024;

function websocketUrl(base: string, code: string): string {
  const url = new URL(`${base}/sessions/${encodeURIComponent(code)}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class P2PProvider implements TransferProvider {
  readonly mode = 'p2p';
  private configValue: P2PConfig | null = null;
  private readonly configOverrides: Partial<P2PConfig>;
  private readonly wakeLock = new TransferWakeLock();
  private callbacks: P2PCallbacks = {};
  private role: Role | null = null;
  private status: P2PStatus = 'idle';
  private socket: WebSocket | null = null;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private files: File[] = [];
  private filesLocked = false;
  private abortController = new AbortController();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pendingFile: ReceivingFile | null = null;
  private currentFile: ReceivingFile | null = null;
  private waiters = new Map<string, Waiter<unknown>>();
  private messageQueue: Promise<void> = Promise.resolve();
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private receivedFiles = 0;
  private receivedOverall = 0;
  private sentOverall = 0;
  private acknowledged = 0;
  private expectedFiles = 0;
  private batchBytes = 0;
  private progressTimes = new Map<string, number>();
  private closing = false;

  constructor(config?: Partial<P2PConfig>) {
    this.configOverrides = config || {};
  }

  private get config(): P2PConfig {
    if (!this.configValue) this.configValue = { ...getP2PConfig(), ...this.configOverrides };
    return this.configValue;
  }

  get currentStatus(): P2PStatus { return this.status; }

  updateSenderFiles(files: File[]): void {
    if (this.role !== 'sender' || this.filesLocked) throw new Error('Daftar file tidak bisa diubah setelah transfer dimulai.');
    if (!files.length) throw new Error('Pilih minimal satu file.');
    this.files = [...files];
  }

  async startSender(files: File[], callbacks: P2PCallbacks = {}): Promise<P2PSessionInfo> {
    if (this.role) throw new Error('Sesi P2P sudah berjalan.');
    if (!files.length) throw new Error('Pilih minimal satu file.');
    this.role = 'sender';
    this.files = [...files];
    this.callbacks = callbacks;
    try {
      const response = await fetch(`${this.config.signalingUrl}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: this.abortController.signal,
      });
      if (!response.ok) throw new Error(`Tidak bisa membuat sesi P2P (${response.status}).`);
      const body = await response.json() as { code?: string; senderToken?: string; expiresAt?: number };
      if (!body.code || !body.senderToken || !Number.isFinite(body.expiresAt) || !body.expiresAt) throw new Error('Respons sesi P2P tidak lengkap.');
      const info: P2PSessionInfo = {
        code: body.code,
        url: `${window.location.origin}/p/${encodeURIComponent(body.code)}`,
        expiresAt: body.expiresAt,
      };
      this.setStatus('waiting');
      await this.openSignal(body.code, { type: 'join', role: 'sender', token: body.senderToken });
      this.armExpiry(body.expiresAt);
      callbacks.onSession?.(info);
      return info;
    } catch (error) {
      this.fail(asError(error));
      throw error;
    }
  }

  async connectReceiver(code: string, callbacks: P2PCallbacks = {}): Promise<void> {
    if (this.role) throw new Error('Sesi P2P sudah berjalan.');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) throw new Error('Kode sesi P2P tidak valid.');
    this.role = 'receiver';
    this.callbacks = callbacks;
    this.setStatus('connecting');
    try {
      await this.openSignal(code, { type: 'join', role: 'receiver' });
      this.armConnectTimeout();
    } catch (error) {
      this.fail(asError(error));
      throw error;
    }
  }

  async acceptFile(fileId: string): Promise<void> {
    const pending = this.pendingFile;
    if (!pending || pending.info.id !== fileId || this.role !== 'receiver') throw new Error('Tidak ada file yang menunggu disimpan.');
    this.pendingFile = null;
    try {
      // createFileSink calls showSaveFilePicker synchronously before its first await.
      const sinkPromise = createFileSink(pending.info.name, pending.info.size, pending.info.type, this.config.blobMaxBytes);
      pending.sink = await sinkPromise;
      this.currentFile = pending;
      this.setStatus('transferring');
      void this.wakeLock.start();
      this.sendControl({ type: 'file-ready', fileId });
    } catch (error) {
      const err = asError(error);
      this.sendControl({ type: 'file-result', fileId, ok: false, error: err.message });
      this.fail(err);
      throw err;
    }
  }

  cancel(): void {
    if (this.channel?.readyState === 'open') this.sendControl({ type: 'cancel', reason: 'Transfer dibatalkan.' });
    this.teardown(new Error('Transfer dibatalkan.'));
    this.setStatus('idle');
  }

  private setStatus(status: P2PStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  private async openSignal(code: string, join: Record<string, string>): Promise<void> {
    const socket = new WebSocket(websocketUrl(this.config.signalingUrl, code));
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => settle(new Error('Signaling tidak merespons.')), this.config.connectTimeoutMs);
      socket.onopen = () => socket.send(JSON.stringify(join));
      socket.onerror = () => settle(new Error('Koneksi signaling gagal.'));
      socket.onclose = () => {
        if (!settled) settle(new Error('Sesi tidak ditemukan atau sudah kedaluwarsa.'));
        else if (this.status !== 'completed' && this.status !== 'idle' && this.status !== 'failed') this.fail(new Error('Koneksi signaling terputus.'));
      };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (message.type === 'joined') { settle(); return; }
          if (message.type === 'error') {
            const error = new Error(typeof message.message === 'string' ? message.message : 'Sesi P2P gagal.');
            settle(error);
            if (this.status !== 'failed') this.fail(error, message.code === 'expired');
            return;
          }
          void this.handleSignal(message).catch(error => this.fail(asError(error)));
        } catch { this.fail(new Error('Pesan signaling tidak valid.')); }
      };
    });
  }

  private async handleSignal(message: Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case 'peer-joined':
      case 'join':
        if (this.role === 'sender' && message.role === 'receiver' && !this.peer) {
          this.setStatus('connecting');
          this.armConnectTimeout();
          await this.createSenderPeer();
        }
        break;
      case 'offer':
        if (this.role === 'receiver' && message.sdp && typeof message.sdp === 'object') {
          const peer = this.createPeer();
          await peer.setRemoteDescription(message.sdp as RTCSessionDescriptionInit);
          await this.flushCandidates();
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          this.sendSignal({ type: 'answer', sdp: answer });
        }
        break;
      case 'answer':
        if (this.role === 'sender' && this.peer && message.sdp && typeof message.sdp === 'object') {
          await this.peer.setRemoteDescription(message.sdp as RTCSessionDescriptionInit);
          await this.flushCandidates();
        }
        break;
      case 'ice':
        if (message.candidate && typeof message.candidate === 'object') {
          const candidate = message.candidate as RTCIceCandidateInit;
          if (this.peer?.remoteDescription) await this.peer.addIceCandidate(candidate);
          else this.pendingCandidates.push(candidate);
        }
        break;
      case 'peer-left':
        this.fail(new Error('Perangkat lain terputus. Coba lagi atau kirim lewat Cloud.'));
        break;
    }
  }

  private createPeer(): RTCPeerConnection {
    if (this.peer) return this.peer;
    const peer = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.peer = peer;
    peer.onicecandidate = event => {
      if (event.candidate && this.socket?.readyState === WebSocket.OPEN) this.sendSignal({ type: 'ice', candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') this.fail(new Error('Koneksi langsung terputus. Coba lagi atau kirim lewat Cloud.'));
      if (peer.connectionState === 'disconnected') {
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.disconnectTimer = setTimeout(() => this.fail(new Error('Koneksi langsung terputus. Coba lagi atau kirim lewat Cloud.')), 5000);
      } else if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null; }
    };
    peer.ondatachannel = event => this.attachChannel(event.channel);
    return peer;
  }

  private async createSenderPeer(): Promise<void> {
    const peer = this.createPeer();
    const channel = peer.createDataChannel('rafqr-files', { ordered: true });
    this.attachChannel(channel);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.sendSignal({ type: 'offer', sdp: offer });
  }

  private async flushCandidates(): Promise<void> {
    const peer = this.peer;
    if (!peer) return;
    for (const candidate of this.pendingCandidates.splice(0)) await peer.addIceCandidate(candidate);
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = CHANNEL_LOW_WATER;
    channel.onopen = () => {
      this.clearConnectTimeout();
      this.setStatus('connected');
      if (this.role === 'sender') {
        this.filesLocked = true;
        void this.sendFiles().catch(error => this.fail(asError(error)));
      }
    };
    channel.onclose = () => { if (this.status !== 'completed' && this.status !== 'failed' && this.status !== 'idle') this.fail(new Error('Koneksi file terputus.')); };
    channel.onerror = () => this.fail(new Error('Kanal transfer file gagal.'));
    channel.onmessage = event => {
      this.messageQueue = this.messageQueue.then(() => this.handleChannelMessage(event.data)).catch(error => this.fail(asError(error)));
    };
  }

  private async handleChannelMessage(data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string') {
      await this.receiveBytes(new Uint8Array(data));
      return;
    }
    const message = JSON.parse(data) as ControlMessage;
    switch (message.type) {
      case 'file-start': this.receiveFileStart(message.file, message.batchBytes); break;
      case 'file-ready': this.resolveWaiter(`ready:${message.fileId}`, undefined); break;
      case 'ack': this.acknowledged = Math.max(this.acknowledged, message.bytes); this.resolveWaiter(`ack:${message.fileId}`, undefined); break;
      case 'file-end': await this.receiveFileEnd(message.fileId); break;
      case 'file-result':
        this.callbacks.onFileResult?.({ fileId: message.fileId, ok: message.ok, error: message.error });
        this.resolveWaiter(`result:${message.fileId}`, message);
        break;
      case 'batch-end':
        if (this.role === 'receiver' && this.receivedFiles === this.expectedFiles) this.finish();
        break;
      case 'cancel': this.fail(new Error(message.reason || 'Transfer dibatalkan oleh perangkat lain.')); break;
    }
  }

  private receiveFileStart(info: P2PFileInfo, batchBytes: number): void {
    if (this.role !== 'receiver' || this.currentFile || this.pendingFile) throw new Error('Urutan file tidak valid.');
    if (!info || typeof info.id !== 'string' || typeof info.name !== 'string' || !Number.isSafeInteger(info.size) || info.size < 0 || !/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error('Metadata file tidak valid.');
    if (!Number.isSafeInteger(batchBytes) || batchBytes < 0) throw new Error('Ukuran total file tidak valid.');
    if (!Number.isSafeInteger(info.total) || info.total < 1 || !Number.isSafeInteger(info.index) || info.index < 0) throw new Error('Daftar file tidak valid.');
    if (!this.expectedFiles) { this.expectedFiles = info.total; this.batchBytes = batchBytes; }
    if (info.index !== this.receivedFiles || info.total !== this.expectedFiles) throw new Error('Urutan file tidak cocok.');
    this.pendingFile = { info, sink: null, received: 0, acknowledged: 0, hash: sha256.create(), startedAt: performance.now(), completed: false };
    this.callbacks.onFile?.(info);
  }

  private async receiveBytes(bytes: Uint8Array): Promise<void> {
    const current = this.currentFile;
    if (this.role !== 'receiver' || !current?.sink) throw new Error('Chunk diterima sebelum file disiapkan.');
    if (current.received + bytes.byteLength > current.info.size) throw new Error('File melebihi ukuran metadata.');
    await current.sink.write(bytes);
    current.hash.update(bytes);
    current.received += bytes.byteLength;
    this.receivedOverall += bytes.byteLength;
    this.emitProgress(current.info.id, current.received, current.info.size, 'receive', this.receivedOverall, this.batchBytes, current.startedAt);
    if (current.received - current.acknowledged >= ACK_INTERVAL || current.received === current.info.size) {
      current.acknowledged = current.received;
      this.sendControl({ type: 'ack', fileId: current.info.id, bytes: current.received });
    }
  }

  private async receiveFileEnd(fileId: string): Promise<void> {
    const current = this.currentFile;
    if (!current || current.info.id !== fileId || !current.sink) throw new Error('Akhir file tidak sesuai.');
    this.setStatus('verifying');
    try {
      if (current.received !== current.info.size) throw new Error('File belum diterima seluruhnya.');
      if (hex(current.hash.digest()) !== current.info.sha256) throw new Error('SHA-256 tidak cocok; file korup.');
      await current.sink.close();
      current.completed = true;
      this.receivedFiles += 1;
      const result: P2PFileResult = { fileId, ok: true };
      this.sendControl({ type: 'file-result', ...result });
      this.callbacks.onFileResult?.(result);
      this.currentFile = null;
      this.setStatus('connected');
    } catch (error) {
      await current.sink.abort().catch(() => undefined);
      const err = asError(error);
      this.sendControl({ type: 'file-result', fileId, ok: false, error: err.message });
      this.callbacks.onFileResult?.({ fileId, ok: false, error: err.message });
      this.fail(err);
    }
  }

  private async sendFiles(): Promise<void> {
    const files = [...this.files];
    if (!files.length) throw new Error('Tidak ada file untuk dikirim.');
    this.batchBytes = files.reduce((sum, file) => sum + file.size, 0);
    void this.wakeLock.start();
    for (let index = 0; index < files.length; index++) {
      if (this.abortController.signal.aborted) throw new Error('Transfer dibatalkan.');
      const file = files[index];
      this.setStatus('verifying');
      const digest = await hashFile(file, undefined, this.abortController.signal);
      const info: P2PFileInfo = {
        id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type,
        index, total: files.length, sha256: digest,
      };
      this.callbacks.onFile?.(info);
      const ready = this.waitFor<void>(`ready:${info.id}`);
      this.sendControl({ type: 'file-start', file: info, batchBytes: this.batchBytes });
      await ready;
      this.setStatus('transferring');
      const startedAt = performance.now();
      this.acknowledged = 0;
      for (let offset = 0; offset < file.size; offset += this.config.chunkBytes) {
        while (offset - this.acknowledged >= SEND_WINDOW) await this.waitFor<void>(`ack:${info.id}`);
        await this.waitForChannelBuffer();
        const bytes = await file.slice(offset, Math.min(file.size, offset + this.config.chunkBytes)).arrayBuffer();
        if (this.abortController.signal.aborted) throw new Error('Transfer dibatalkan.');
        this.channel?.send(bytes);
        this.emitProgress(info.id, Math.min(offset + bytes.byteLength, file.size), file.size, 'send', this.sentOverall + Math.min(offset + bytes.byteLength, file.size), this.batchBytes, startedAt);
      }
      this.sentOverall += file.size;
      const result = this.waitFor<Extract<ControlMessage, { type: 'file-result' }>>(`result:${info.id}`);
      this.sendControl({ type: 'file-end', fileId: info.id });
      const verified = await result;
      if (!verified.ok) throw new Error(verified.error || 'File gagal diverifikasi di penerima.');
    }
    this.sendControl({ type: 'batch-end' });
    this.finish();
  }

  private async waitForChannelBuffer(): Promise<void> {
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') throw new Error('Kanal transfer terputus.');
    if (channel.bufferedAmount <= CHANNEL_HIGH_WATER) return;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { cleanup(); reject(new Error('Transfer dibatalkan.')); };
      const low = () => { cleanup(); resolve(); };
      const cleanup = () => {
        channel.removeEventListener('bufferedamountlow', low);
        this.abortController.signal.removeEventListener('abort', abort);
      };
      channel.addEventListener('bufferedamountlow', low, { once: true });
      this.abortController.signal.addEventListener('abort', abort, { once: true });
    });
  }

  private emitProgress(fileId: string, transferredBytes: number, totalBytes: number, direction: 'send' | 'receive', overallTransferredBytes: number, overallBytes: number, startedAt: number): void {
    const now = performance.now();
    const key = `${direction}:${fileId}`;
    const last = this.progressTimes.get(key);
    if (last !== undefined && transferredBytes !== totalBytes && now - last < 150) return;
    this.progressTimes.set(key, now);
    const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
    const speedBps = transferredBytes / seconds;
    const remaining = totalBytes - transferredBytes;
    const progress: P2PProgress = {
      fileId, transferredBytes, totalBytes, speedBps,
      etaSeconds: speedBps > 0 && remaining > 0 ? remaining / speedBps : remaining === 0 ? 0 : null,
      direction, overallTransferredBytes, overallBytes,
    };
    this.callbacks.onProgress?.(progress);
  }

  private waitFor<T>(key: string): Promise<T> {
    if (this.abortController.signal.aborted) return Promise.reject(new Error('Transfer dibatalkan.'));
    return new Promise<T>((resolve, reject) => {
      this.waiters.set(key, { resolve: resolve as (value: unknown) => void, reject });
    });
  }

  private resolveWaiter(key: string, value: unknown): void {
    const waiter = this.waiters.get(key);
    if (!waiter) return;
    this.waiters.delete(key);
    waiter.resolve(value);
  }

  private sendSignal(message: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Koneksi signaling tidak tersedia.');
    this.socket.send(JSON.stringify(message));
  }

  private sendControl(message: ControlMessage): void {
    if (this.channel?.readyState !== 'open') throw new Error('Kanal transfer belum terhubung.');
    this.channel.send(JSON.stringify(message));
  }

  private armConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimer = setTimeout(() => {
      if (this.channel?.readyState !== 'open') this.fail(new Error('Gagal tersambung langsung dalam 10 detik. Kirim lewat Cloud?'));
    }, this.config.connectTimeoutMs);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private armExpiry(expiresAt: number): void {
    const delay = expiresAt - Date.now();
    this.expiryTimer = setTimeout(() => {
      if (this.status === 'waiting') {
        this.fail(new Error('Sesi P2P kedaluwarsa.'), true);
      }
    }, Math.max(0, delay));
  }

  private finish(): void {
    this.setStatus('completed');
    void this.wakeLock.stop();
    // Leave sockets open briefly so the final control frame can be delivered.
    setTimeout(() => this.teardown(), 1000);
  }

  private fail(error: Error, expired = false): void {
    if (this.closing || this.status === 'failed' || this.status === 'completed' || this.status === 'expired') return;
    this.setStatus(expired ? 'expired' : 'failed');
    this.callbacks.onError?.(error);
    void this.currentFile?.sink?.abort().catch(() => undefined);
    this.teardown(error);
  }

  private teardown(error = new Error('Sesi P2P ditutup.')): void {
    if (this.closing) return;
    this.closing = true;
    this.abortController.abort();
    this.clearConnectTimeout();
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.waiters.clear();
    this.channel?.close();
    this.peer?.close();
    this.socket?.close();
    void this.wakeLock.stop();
  }
}
