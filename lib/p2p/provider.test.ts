import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from './hash';
import { P2PProvider } from './provider';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('P2P receiver failure cleanup', () => {
  it('reports a save failure even if the peer disconnected while the picker was open', async () => {
    vi.stubEnv('NEXT_PUBLIC_P2P_SIGNALING_URL', 'http://127.0.0.1:8787');
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { removeEventListener: vi.fn() });
    const onError = vi.fn();
    const provider = new P2PProvider();
    const state = provider as unknown as {
      role: string;
      callbacks: { onError: typeof onError };
      pendingFile: unknown;
      channel: { readyState: string; close: () => void };
    };
    state.role = 'receiver';
    state.callbacks = { onError };
    state.channel = { readyState: 'closed', close: vi.fn() };
    state.pendingFile = {
      info: { id: 'file-1', name: 'besar.bin', size: 101 * 1024 * 1024, type: '', index: 0, total: 1, sha256: '0'.repeat(64) },
      sink: null,
      received: 0,
      acknowledged: 0,
      hash: sha256.create(),
      startedAt: 0,
      completed: false,
    };

    await expect(provider.acceptFile('file-1')).rejects.toThrow(/mode Cloud/);
    expect(provider.currentStatus).toBe('failed');
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('P2P text and preview', () => {
  it('sends a text-only preview and finishes the batch without a file', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'hidden' });
    const send = vi.fn();
    const provider = new P2PProvider();
    const state = provider as unknown as {
      role: string;
      textContent: string;
      channel: { readyState: string; send: typeof send; close: () => void };
      sendFiles: () => Promise<void>;
    };
    state.role = 'sender';
    state.textContent = 'Halo dari QRData';
    state.channel = { readyState: 'open', send, close: vi.fn() };

    await state.sendFiles();

    expect(send.mock.calls.map(([raw]) => JSON.parse(raw).type)).toEqual(['preview', 'batch-end']);
    expect(JSON.parse(send.mock.calls[0][0]).preview).toEqual({ files: [], totalFiles: 0, text: 'Halo dari QRData' });
    expect(provider.currentStatus).toBe('completed');
    vi.runAllTimers();
  });

  it('shows a text-only preview to the receiver and completes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { removeEventListener: vi.fn() });
    const onPreview = vi.fn();
    const provider = new P2PProvider();
    const state = provider as unknown as {
      role: string;
      callbacks: { onPreview: typeof onPreview };
      channel: { close: () => void };
      handleChannelMessage: (raw: string) => Promise<void>;
    };
    state.role = 'receiver';
    state.callbacks = { onPreview };
    state.channel = { close: vi.fn() };

    await state.handleChannelMessage(JSON.stringify({ type: 'preview', preview: { files: [], totalFiles: 0, text: 'Pesan masuk' } }));
    await state.handleChannelMessage(JSON.stringify({ type: 'batch-end' }));

    expect(onPreview).toHaveBeenCalledWith({ files: [], totalFiles: 0, text: 'Pesan masuk' });
    expect(provider.currentStatus).toBe('completed');
    vi.runAllTimers();
  });

  it('shows file metadata before asking the receiver to save the file', async () => {
    vi.stubGlobal('document', { removeEventListener: vi.fn() });
    const onPreview = vi.fn();
    const onFile = vi.fn();
    const provider = new P2PProvider();
    const state = provider as unknown as {
      role: string;
      callbacks: { onPreview: typeof onPreview; onFile: typeof onFile };
      handleChannelMessage: (raw: string) => Promise<void>;
    };
    state.role = 'receiver';
    state.callbacks = { onPreview, onFile };
    await state.handleChannelMessage(JSON.stringify({ type: 'preview', preview: { files: [{ name: 'foto.jpg', size: 3, type: 'image/jpeg' }], totalFiles: 1, text: '' } }));
    await state.handleChannelMessage(JSON.stringify({ type: 'file-start', file: { id: 'file-1', name: 'foto.jpg', size: 3, type: 'image/jpeg', index: 0, total: 1, sha256: '0'.repeat(64) }, batchBytes: 3 }));
    expect(onPreview.mock.invocationCallOrder[0]).toBeLessThan(onFile.mock.invocationCallOrder[0]);
    expect(onFile).toHaveBeenCalledOnce();
    provider.cancel();
  });
});

describe('receiver-created invitations', () => {
  it('creates one session and gives the receiver a sender-only invitation', async () => {
    vi.stubEnv('NEXT_PUBLIC_P2P_SIGNALING_URL', 'http://127.0.0.1:8787');
    vi.stubGlobal('window', { location: { origin: 'https://qrdata.biz.id' } });
    vi.stubGlobal('document', { removeEventListener: vi.fn() });
    const send = vi.fn();
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public url: string) { queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
      send(raw: string) { send(JSON.parse(raw)); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'joined' }) })); }
      close() { this.readyState = 3; }
    }
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const fetchSession = vi.fn(async () => ({ ok: true, json: async () => ({ code: 'ABCDEFGHIJKLMNOP', senderToken: 'x'.repeat(43), expiresAt: Date.now() + 600_000 }) }));
    vi.stubGlobal('fetch', fetchSession);

    const receiver = new P2PProvider();
    const invitation = await receiver.startReceiver();
    expect(invitation.url).toBe('https://qrdata.biz.id/p/ABCDEFGHIJKLMNOP/send#token=' + 'x'.repeat(43));
    expect(send).toHaveBeenCalledWith({ type: 'join', role: 'receiver' });

    const sender = new P2PProvider();
    await sender.startSender([], {}, { text: 'Halo', invitation: { code: invitation.code, token: 'x'.repeat(43) } });
    expect(fetchSession).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ type: 'join', role: 'sender', token: 'x'.repeat(43) });
    receiver.cancel();
    sender.cancel();
  });
});
