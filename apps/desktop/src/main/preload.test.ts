import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The preload module calls `contextBridge.exposeInMainWorld` at import time,
 * so we mock Electron's preload APIs and then import the module to exercise
 * the channel allowlist (assertAllowedChannel) and invokeWithTimeout logic
 * embedded inside the exposed `electronAPI` object.
 */

const mockInvoke = vi.fn();
const mockSend = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
let exposedAPI: Record<string, unknown> | null = null;

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, api: Record<string, unknown>) {
      exposedAPI = api;
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    send: (...args: unknown[]) => mockSend(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}));

// Import the preload module; this triggers `contextBridge.exposeInMainWorld`
// and captures the API object via our mock.
beforeEach(async () => {
  vi.clearAllMocks();
  exposedAPI = null;
  // Re-import to capture the API fresh
  vi.resetModules();

  // Re-apply the electron mock after resetModules
  vi.doMock('electron', () => ({
    contextBridge: {
      exposeInMainWorld(_key: string, api: Record<string, unknown>) {
        exposedAPI = api;
      },
    },
    ipcRenderer: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
      send: (...args: unknown[]) => mockSend(...args),
      on: (...args: unknown[]) => mockOn(...args),
      removeListener: (...args: unknown[]) => mockRemoveListener(...args),
    },
  }));

  await import('./preload');
});

function getAPI() {
  if (!exposedAPI) throw new Error('electronAPI was not exposed');
  return exposedAPI as {
    ipc: {
      invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) => Promise<T>;
    };
    store: {
      get: (key: string) => Promise<unknown>;
    };
  };
}

describe('preload assertAllowedChannel', () => {
  it('invokeWithTimeout resolves for an allowed channel', async () => {
    mockInvoke.mockResolvedValue('ok');
    const api = getAPI();

    const result = await api.ipc.invokeWithTimeout('store:get', 5000, 'theme');
    expect(result).toBe('ok');
    expect(mockInvoke).toHaveBeenCalledWith('store:get', 'theme');
  });

  it('invokeWithTimeout throws synchronously for a disallowed channel', () => {
    const api = getAPI();

    expect(() => api.ipc.invokeWithTimeout('evil:channel', 5000)).toThrow(
      'IPC channel not allowed: "evil:channel"',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invokeWithTimeout rejects after timeout when invoke hangs', async () => {
    // Simulate an invoke that never resolves
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const api = getAPI();

    await expect(
      api.ipc.invokeWithTimeout('store:get', 50, 'theme'),
    ).rejects.toThrow('IPC timeout: "store:get" did not respond within 50ms');
  });

  it('invokeWithTimeout resolves before timeout for fast responses', async () => {
    mockInvoke.mockResolvedValue(42);
    const api = getAPI();

    const result = await api.ipc.invokeWithTimeout('store:get', 5000, 'settings');
    expect(result).toBe(42);
  });
});
