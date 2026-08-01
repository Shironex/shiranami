/**
 * The three properties v1's `createIpcListener` had for free and Tauri's
 * `listen` has none of: precise removal, an idempotent non-throwing unsubscribe,
 * and one registration shared by many handlers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DROP, resetChannelRegistry, subscribeChannel, type EventBinding } from './events';

/** A stand-in for a generated event binding, with the registration observable. */
function fakeBinding() {
  const state = {
    listens: 0,
    unlistens: 0,
    emit: (_payload: unknown) => {},
  };

  const binding: EventBinding = {
    listen: callback => {
      state.listens += 1;
      state.emit = payload => callback({ payload });
      return Promise.resolve(() => {
        state.unlistens += 1;
      });
    },
  };

  return { binding, state };
}

/** A binding whose `listen` stays pending until released. */
function pendingBinding() {
  let release: (() => void) | undefined;
  const state = { unlistens: 0 };

  const binding: EventBinding = {
    listen: () =>
      new Promise(resolve => {
        release = () =>
          resolve(() => {
            state.unlistens += 1;
          });
      }),
  };

  return { binding, state, release: () => release?.() };
}

const passthrough = <T>(payload: unknown): T | typeof DROP => payload as T;

afterEach(() => {
  resetChannelRegistry();
});

describe('subscribeChannel', () => {
  it('delivers the payload the backend emitted, untouched', () => {
    const { binding, state } = fakeBinding();
    const seen = vi.fn();
    const payload = { current: 1, total: 9, trackName: 'x' };

    subscribeChannel('loudness:progress', binding, passthrough, seen);
    state.emit(payload);

    expect(seen).toHaveBeenCalledWith(payload);
    expect(seen.mock.calls[0][0]).toBe(payload);
  });

  it('opens exactly one registration however many components subscribe', () => {
    const { binding, state } = fakeBinding();

    subscribeChannel('downloader:progress', binding, passthrough, vi.fn());
    subscribeChannel('downloader:progress', binding, passthrough, vi.fn());
    subscribeChannel('downloader:progress', binding, passthrough, vi.fn());

    expect(state.listens).toBe(1);
  });

  it('removes only the listener that unsubscribed', () => {
    // The property `ipcRenderer.removeListener` had and Tauri's unlisten does
    // not: several components share `system:notice`, and one unmounting must
    // not deafen the others.
    const { binding, state } = fakeBinding();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();

    const unsubscribe = subscribeChannel('system:notice', binding, passthrough, first);
    subscribeChannel('system:notice', binding, passthrough, second);
    subscribeChannel('system:notice', binding, passthrough, third);

    unsubscribe();
    state.emit({ source: 'discord', level: 'warn', code: 'login_failed' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
  });

  it('is idempotent, and a repeat call removes nobody else', () => {
    const { binding, state } = fakeBinding();
    const kept = vi.fn();

    const unsubscribe = subscribeChannel('media:command', binding, passthrough, vi.fn());
    subscribeChannel('media:command', binding, passthrough, kept);

    unsubscribe();
    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();

    state.emit('toggle-play');
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('closes the registration when the last subscriber leaves, and reopens after', async () => {
    const { binding, state } = fakeBinding();

    const unsubscribe = subscribeChannel('window:maximized-change', binding, passthrough, vi.fn());
    // `listen` is async, so the registration is only held once its promise has
    // settled. Awaiting here is what separates this case from the
    // unsubscribed-while-still-pending one below.
    await Promise.resolve();
    unsubscribe();

    expect(state.unlistens).toBe(1);

    subscribeChannel('window:maximized-change', binding, passthrough, vi.fn());
    expect(state.listens).toBe(2);
  });

  it('swallows a throwing unlisten rather than letting it reach the renderer', () => {
    // Tauri throws when unlistening a registration that is already gone, and
    // there is no way to ask whether it is. In nightcore that throw reached the
    // unhandledrejection handler and became an error toast on every StrictMode
    // remount — a visible bug caused by cleanup succeeding.
    const binding: EventBinding = {
      listen: () =>
        Promise.resolve(() => {
          throw new Error('event handler not found');
        }),
    };

    const unsubscribe = subscribeChannel('share:deep-link', binding, passthrough, vi.fn());

    expect(() => unsubscribe()).not.toThrow();
  });

  it('tears down a registration that resolves after its last subscriber left', async () => {
    // The StrictMode double-mount shape: subscribe, unsubscribe, both before
    // `listen` resolves. Without the closed check this leaks a live
    // registration nothing will ever close.
    const { binding, state, release } = pendingBinding();

    const unsubscribe = subscribeChannel('library:scan-progress', binding, passthrough, vi.fn());
    unsubscribe();

    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(state.unlistens).toBe(1);
  });

  it('drops a payload the narrower rejects instead of handing it to the callback', () => {
    const { binding, state } = fakeBinding();
    const seen = vi.fn();
    const onlyStrings = <T>(payload: unknown): T | typeof DROP =>
      typeof payload === 'string' ? (payload as T) : DROP;

    subscribeChannel('media:command', binding, onlyStrings, seen);
    state.emit({ not: 'a string' });
    state.emit('next');

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('next');
  });

  it('keeps fanning out when a listener unsubscribes mid-dispatch', () => {
    const { binding, state } = fakeBinding();
    const later = vi.fn();

    const unsubscribeSelf = subscribeChannel('debug:metrics', binding, passthrough, () => {
      unsubscribeSelf();
    });
    subscribeChannel('debug:metrics', binding, passthrough, later);

    expect(() => state.emit({ ts: 1, procs: [] })).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('keeps separate channels separate', () => {
    const scan = fakeBinding();
    const enrich = fakeBinding();
    const onScan = vi.fn();
    const onEnrich = vi.fn();

    subscribeChannel('library:scan-progress', scan.binding, passthrough, onScan);
    subscribeChannel('metadata:enrich:progress', enrich.binding, passthrough, onEnrich);

    scan.state.emit({ filePath: 'a' });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onEnrich).not.toHaveBeenCalled();
  });
});
