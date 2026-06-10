import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeIpcError, IpcError } from '../ipc/errors';

// Controllable ipcRenderer.invoke. The global setup mocks `electron` without an
// `ipcRenderer`, so scope a local mock that lets each test drive the resolution.
const invokeMock = vi.fn();
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => invokeMock(...args),
  },
}));

// A real, allowlisted channel so assertAllowedChannel passes.
const CHANNEL = 'metadata:enrich:preview';

describe('preload invoke wrapper', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('rejects non-allowlisted channels before any IPC traffic', async () => {
    const { invoke } = await import('./context-bridge');
    // assertAllowedChannel throws synchronously (a programming error, never
    // user-driven) before any IPC traffic, matching the original wrapper.
    expect(() => invoke('not:a:real:channel')).toThrow(/not allowed/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('passes through resolved values unchanged', async () => {
    invokeMock.mockResolvedValue({ ok: true });
    const { invoke } = await import('./context-bridge');
    await expect(invoke(CHANNEL, 'arg')).resolves.toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith(CHANNEL, 'arg');
  });

  it('rehydrates a sentinel-encoded IpcError into a structured error (code + clean message)', async () => {
    // Simulate Electron's serialized rejection: the handler threw an IpcError,
    // which with-ipc-handler encodes; Electron wraps it with its own prefix.
    const encoded = encodeIpcError(new IpcError('metadata.enrich_busy', 'busy now', { slot: 1 }));
    invokeMock.mockRejectedValue(
      new Error(`Error invoking remote method '${CHANNEL}': Error: ${encoded}`)
    );

    const { invoke } = await import('./context-bridge');
    let caught: unknown;
    try {
      await invoke(CHANNEL);
    } catch (err) {
      caught = err;
    }

    const e = caught as Error & { code?: string; details?: unknown };
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('metadata.enrich_busy');
    expect(e.message).toBe('busy now'); // clean message, no Electron prefix
    expect(e.details).toEqual({ slot: 1 });
  });

  it('strips the Electron prefix from plain (non-IpcError) rejections', async () => {
    invokeMock.mockRejectedValue(
      new Error(`Error invoking remote method '${CHANNEL}': Error: something broke`)
    );

    const { invoke } = await import('./context-bridge');
    let caught: unknown;
    try {
      await invoke(CHANNEL);
    } catch (err) {
      caught = err;
    }

    const e = caught as Error & { code?: string };
    expect(e.message).toBe('something broke');
    expect(e.code).toBeUndefined();
  });
});
