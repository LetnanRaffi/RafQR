import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from './hash';
import { P2PProvider } from './provider';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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
