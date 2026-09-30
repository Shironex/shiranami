/**
 * `share.onDeepLink`: the live event plus the one-time cold-start drain.
 *
 * A link that launches the app is held by the shell until the renderer asks
 * for it, so the drain is the only way that link is ever seen. These pin the
 * two properties that make it safe: it reaches the renderer exactly once, and
 * it survives React `<StrictMode>` subscribing, unsubscribing and subscribing
 * again before the take resolves.
 *
 * No `expect(...).rejects`: the matcher is broken in this project.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const shareTakePendingDeepLink = vi.fn<() => Promise<string | null>>();

/** The live `share:deep-link` registration, observable and drivable. */
const live = {
  emit: (_payload: unknown) => {},
  /** When the webview's listen round-trip completes; immediate unless a test holds it. */
  registered: Promise.resolve() as Promise<void>,
};

vi.mock('@shiranami/contracts/bindings', () => ({
  commands: {
    shareTakePendingDeepLink: () => shareTakePendingDeepLink(),
  },
  events: {
    shareDeepLink: {
      listen: (callback: (event: { payload: unknown }) => void) => {
        live.emit = payload => callback({ payload });
        return live.registered.then(() => () => {});
      },
    },
  },
}));

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every queued microtask and the next macrotask run. */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * A fresh shim per test. The drain is module state that lives for a page load,
 * so each test is its own page load. The reset also puts the mock above in
 * front of the real bindings, which `src/test/setup.ts` has already pulled
 * into the registry through `@/lib/platform`.
 */
async function loadShareApi() {
  vi.resetModules();
  const { shareApi } = await import('./share');
  return shareApi;
}

beforeEach(() => {
  vi.clearAllMocks();
  live.emit = () => {};
  live.registered = Promise.resolve();
});

describe('share.onDeepLink', () => {
  /**
   * The take flips the shell from holding links to emitting them. Taking before
   * the live listener is registered would open a gap in which an emitted link
   * reaches nobody.
   */
  it('takes the pending link only once the live listener is registered', async () => {
    const registration = deferred<void>();
    live.registered = registration.promise;
    shareTakePendingDeepLink.mockResolvedValue('AbC123');
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    shareApi.onDeepLink(seen);
    await settle();
    expect(shareTakePendingDeepLink).not.toHaveBeenCalled();

    registration.resolve();
    await settle();
    expect(shareTakePendingDeepLink).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('AbC123');
  });

  it('delivers a cold-start link once', async () => {
    shareTakePendingDeepLink.mockResolvedValue('AbC123');
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    shareApi.onDeepLink(seen);
    await settle();

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('AbC123');
  });

  it('takes the pending link once per page load, however many subscribe', async () => {
    shareTakePendingDeepLink.mockResolvedValue('AbC123');
    const shareApi = await loadShareApi();
    const first = vi.fn();
    const second = vi.fn();

    shareApi.onDeepLink(first);
    shareApi.onDeepLink(second);
    await settle();

    expect(shareTakePendingDeepLink).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('survives a StrictMode subscribe, unsubscribe, subscribe', async () => {
    // What every mount does in development: the first subscription is torn
    // down before the take can answer, and the second one is the real one.
    const take = deferred<string | null>();
    shareTakePendingDeepLink.mockReturnValue(take.promise);
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    const unsubscribe = shareApi.onDeepLink(seen);
    unsubscribe();
    shareApi.onDeepLink(seen);
    take.resolve('AbC123');
    await settle();

    expect(shareTakePendingDeepLink).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('AbC123');
  });

  it('waits for the replacement listener after a StrictMode remount', async () => {
    // The first registration's round-trip finishing says nothing about the
    // second one, and taking in between would emit a link to nobody.
    const firstListen = deferred<void>();
    const secondListen = deferred<void>();
    shareTakePendingDeepLink.mockResolvedValue('AbC123');
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    live.registered = firstListen.promise;
    const unsubscribe = shareApi.onDeepLink(seen);
    unsubscribe();
    live.registered = secondListen.promise;
    shareApi.onDeepLink(seen);

    firstListen.resolve();
    await settle();
    expect(shareTakePendingDeepLink).not.toHaveBeenCalled();

    secondListen.resolve();
    await settle();
    expect(shareTakePendingDeepLink).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('AbC123');
  });

  it('never hands the link to a subscriber that left before the take answered', async () => {
    const take = deferred<string | null>();
    shareTakePendingDeepLink.mockReturnValue(take.promise);
    const shareApi = await loadShareApi();
    const departed = vi.fn();
    const staying = vi.fn();

    const unsubscribe = shareApi.onDeepLink(departed);
    shareApi.onDeepLink(staying);
    unsubscribe();
    take.resolve('AbC123');
    await settle();

    expect(departed).not.toHaveBeenCalled();
    expect(staying).toHaveBeenCalledWith('AbC123');
  });

  it('keeps the link for the next subscriber when nobody is left to take it', async () => {
    const take = deferred<string | null>();
    shareTakePendingDeepLink.mockReturnValue(take.promise);
    const shareApi = await loadShareApi();
    const departed = vi.fn();
    const later = vi.fn();

    shareApi.onDeepLink(departed)();
    take.resolve('AbC123');
    await settle();
    shareApi.onDeepLink(later);
    await settle();

    expect(departed).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledWith('AbC123');
  });

  it('delivers nothing when there was no pending link', async () => {
    shareTakePendingDeepLink.mockResolvedValue(null);
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    shareApi.onDeepLink(seen);
    await settle();

    expect(seen).not.toHaveBeenCalled();
  });

  it('still delivers the live event', async () => {
    shareTakePendingDeepLink.mockResolvedValue(null);
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    shareApi.onDeepLink(seen);
    await settle();
    live.emit('XyZ789');

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('XyZ789');
  });

  it('keeps the live event working when the take fails', async () => {
    // An older shell without the command must not cost the running app its
    // share links.
    const take = deferred<string | null>();
    shareTakePendingDeepLink.mockReturnValue(take.promise);
    const shareApi = await loadShareApi();
    const seen = vi.fn();

    shareApi.onDeepLink(seen);
    take.reject(new Error('command share_take_pending_deep_link not found'));
    await settle();
    live.emit('XyZ789');

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('XyZ789');
  });
});
