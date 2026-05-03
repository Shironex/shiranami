import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the preload context-bridge utilities: the channel allowlist
 * (assertAllowedChannel) and invokeWithTimeout. These are tested directly
 * against context-bridge.ts rather than through the renderer surface, since
 * the ipc.invokeWithTimeout escape hatch was removed from the exposed API.
 */

const mockInvoke = vi.fn();
const mockSend = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, _api: Record<string, unknown>) {},
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    send: (...args: unknown[]) => mockSend(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}));

let invokeWithTimeout: (channel: string, timeoutMs: number, ...args: unknown[]) => Promise<unknown>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  vi.doMock('electron', () => ({
    contextBridge: {
      exposeInMainWorld(_key: string, _api: Record<string, unknown>) {},
    },
    ipcRenderer: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
      send: (...args: unknown[]) => mockSend(...args),
      on: (...args: unknown[]) => mockOn(...args),
      removeListener: (...args: unknown[]) => mockRemoveListener(...args),
    },
  }));

  const mod = await import('./preload/context-bridge');
  invokeWithTimeout = mod.invokeWithTimeout;
});

describe('preload assertAllowedChannel', () => {
  it('invokeWithTimeout resolves for an allowed channel', async () => {
    mockInvoke.mockResolvedValue('ok');

    const result = await invokeWithTimeout('store:get', 5000, 'theme');
    expect(result).toBe('ok');
    expect(mockInvoke).toHaveBeenCalledWith('store:get', 'theme');
  });

  it('invokeWithTimeout throws synchronously for a disallowed channel', () => {
    expect(() => invokeWithTimeout('evil:channel', 5000)).toThrow(
      'IPC channel not allowed: "evil:channel"'
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invokeWithTimeout rejects after timeout when invoke hangs', async () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));

    await expect(invokeWithTimeout('store:get', 50, 'theme')).rejects.toThrow(
      'IPC timeout: "store:get" did not respond within 50ms'
    );
  });

  it('invokeWithTimeout resolves before timeout for fast responses', async () => {
    mockInvoke.mockResolvedValue(42);

    const result = await invokeWithTimeout('store:get', 5000, 'settings');
    expect(result).toBe(42);
  });
});
