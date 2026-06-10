import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the preload context-bridge utilities: the channel allowlist
 * (assertAllowedChannel) and the shared `invoke` wrapper every api/* module
 * routes through. Tested directly against context-bridge.ts rather than the
 * renderer surface. Error rehydration is covered in context-bridge.test.ts.
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

let invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;

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
  invoke = mod.invoke;
});

describe('preload invoke wrapper', () => {
  it('forwards args and resolves for an allowed channel', async () => {
    mockInvoke.mockResolvedValue('ok');

    const result = await invoke('store:get', 'theme');
    expect(result).toBe('ok');
    expect(mockInvoke).toHaveBeenCalledWith('store:get', 'theme');
  });

  it('throws synchronously for a disallowed channel before any IPC traffic', () => {
    expect(() => invoke('evil:channel')).toThrow('IPC channel not allowed: "evil:channel"');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('does not impose a timeout on a hanging invoke (long-running ops are allowed)', async () => {
    let settled = false;
    mockInvoke.mockReturnValue(new Promise(() => {}));

    const pending = invoke('store:get', 'theme').then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    // Yield the microtask queue; the wrapper must NOT reject on its own.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    void pending;
  });
});
