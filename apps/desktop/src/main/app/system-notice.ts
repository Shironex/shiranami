import { IPC_CHANNELS } from '@shiranami/contracts';
import type { SystemNotice } from '@shiranami/contracts';
import { sendToRenderer } from '../utils/window';

/**
 * Surface a swallowed subsystem failure to the renderer as a structured
 * `system:notice` event. The renderer maps `notice.code` to an i18n string and
 * shows a calm toast (`useSystemNotices`).
 *
 * Dedupe/throttle lives here so the emitters stay dumb: a notice with the same
 * `source:code` key is suppressed if one was already emitted within
 * `cooldownMs`. This keeps a persistent failure (e.g. the Discord reconnect
 * loop, or a repeatedly-failing prune) from turning into a toast storm. The
 * default cooldown is generous; emitters that already gate on "entering the
 * failed state" can pass a shorter window.
 */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

const lastEmittedAt = new Map<string, number>();

export function emitSystemNotice(
  notice: SystemNotice,
  options: { cooldownMs?: number } = {}
): void {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const key = `${notice.source}:${notice.code}`;
  const now = Date.now();
  const last = lastEmittedAt.get(key);

  // Clamp to >= 0 so a backward clock jump can't make a stale notice look fresh.
  if (last !== undefined && Math.max(0, now - last) < cooldownMs) {
    return;
  }

  lastEmittedAt.set(key, now);
  sendToRenderer(IPC_CHANNELS.system.notice, notice);
}

/**
 * Forget the dedupe timestamp for a `source:code` so the next emit goes through
 * immediately. Used when a subsystem recovers (e.g. Discord reconnects) so a
 * later failure surfaces again without waiting out the cooldown.
 */
export function resetSystemNotice(source: SystemNotice['source'], code: string): void {
  lastEmittedAt.delete(`${source}:${code}`);
}

/** Test-only: clear all dedupe state. */
export function __resetSystemNoticeState(): void {
  lastEmittedAt.clear();
}
