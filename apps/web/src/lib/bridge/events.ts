/**
 * The per-channel fan-out registry behind every `on*` method.
 *
 * v1's `createIpcListener` was four lines because `ipcRenderer` already had the
 * two properties that matter: many handlers per channel, and a `removeListener`
 * that takes one of them. Tauri's `listen` has neither — each call is its own
 * registration, and the unlisten it returns **throws** when called against a
 * registration that is already gone. React `<StrictMode>` double-mounts every
 * effect, so that throw is not a corner case; it is what every subscribing
 * component does on its first mount in development.
 *
 * So one Tauri registration is opened per channel and handlers fan out from it:
 *
 * - **Precise.** The returned unsubscribe removes one handler from the channel's
 *   set. Several components share `downloader:progress` and `system:notice`, and
 *   one unmounting must not deafen the others.
 * - **Idempotent and non-throwing.** A second call is a no-op, and the teardown
 *   of the underlying registration swallows the throw described above.
 * - **Lazy and self-closing.** The registration opens on the first subscriber
 *   and closes when the last one leaves, so a channel nothing listens to costs
 *   nothing — matching `ipcRenderer.on`, which also only cost what was attached.
 *
 * Payloads are re-validated on the way in (§2.6): the Rust side is trusted
 * structurally, not blindly, and a payload that fails its narrower is dropped
 * rather than handed to a callback that would read fields off it.
 */

import type { IpcChannelName } from '@shiranami/contracts';
import { logger } from '@/lib/logger';

/** What a narrower returns when the payload is not the shape it claims to be. */
export const DROP = Symbol('bridge.drop');

/** Validates an inbound payload, or asks for it to be dropped. */
export type Narrower<T> = (payload: unknown) => T | typeof DROP;

/** The one method of a generated event binding this registry uses. */
export interface EventBinding {
  listen: (callback: (event: { payload: unknown }) => void) => Promise<() => void>;
}

type Listener = (payload: unknown) => void;

interface Registration {
  readonly listeners: Set<Listener>;
  /** Set once the Tauri registration resolves; `null` while it is in flight. */
  unlisten: (() => void) | null;
  /** True once the last subscriber left, so a late-resolving listen tears down. */
  closed: boolean;
}

const registry = new Map<string, Registration>();

/**
 * Call a Tauri unlisten without letting its throw escape.
 *
 * Tauri throws when unlistening a registration that is already gone, and there
 * is no way to ask whether it is. In nightcore that throw reached the renderer's
 * `unhandledrejection` handler and surfaced as an error toast on every
 * `<StrictMode>` remount — a visible bug caused entirely by cleanup succeeding.
 */
function safeUnlisten(unlisten: () => void): void {
  try {
    unlisten();
  } catch {
    // The registration was already removed; nothing is leaked either way.
  }
}

function open(channel: string, binding: EventBinding): Registration {
  const registration: Registration = { listeners: new Set(), unlisten: null, closed: false };
  registry.set(channel, registration);

  void binding
    .listen(event => {
      // A copy, so a callback that unsubscribes itself (or a sibling) mid-fanout
      // does not mutate the set being iterated.
      for (const listener of [...registration.listeners]) listener(event.payload);
    })
    .then(unlisten => {
      // Subscribe-then-unsubscribe can complete before this resolves, which is
      // exactly what a <StrictMode> double-mount does. Tear down rather than
      // holding a registration nothing will ever close.
      if (registration.closed) {
        safeUnlisten(unlisten);
        return;
      }
      registration.unlisten = unlisten;
    })
    .catch((error: unknown) => {
      logger.error(`[bridge] failed to listen on ${channel}`, error);
      registry.delete(channel);
    });

  return registration;
}

function close(channel: string, registration: Registration): void {
  registration.closed = true;
  // Delete before unlistening: a subscriber arriving in between must open a
  // fresh registration rather than attach to one being torn down.
  if (registry.get(channel) === registration) registry.delete(channel);
  if (registration.unlisten) safeUnlisten(registration.unlisten);
}

/**
 * Subscribe `callback` to `channel`, returning v1's precise unsubscribe.
 *
 * The returned function is what every `on*` method hands back, and it carries
 * v1's contract: removes this listener only, safe to call more than once, never
 * throws.
 */
export function subscribeChannel<T>(
  channel: IpcChannelName,
  binding: EventBinding,
  narrow: Narrower<T>,
  callback: (payload: T) => void
): () => void {
  const registration = registry.get(channel) ?? open(channel, binding);

  const listener: Listener = raw => {
    const payload = narrow(raw);
    if (payload === DROP) {
      logger.warn(`[bridge] dropped a malformed ${channel} payload`);
      return;
    }
    callback(payload);
  };
  registration.listeners.add(listener);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    registration.listeners.delete(listener);
    if (registration.listeners.size === 0) close(channel, registration);
  };
}

/**
 * Drop every registration. Test-only: the registry is module state, and a suite
 * that left a channel open would leak it into the next test's fan-out.
 */
export function resetChannelRegistry(): void {
  for (const [channel, registration] of [...registry]) close(channel, registration);
  registry.clear();
}
