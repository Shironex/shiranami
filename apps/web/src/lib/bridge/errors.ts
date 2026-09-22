/**
 * Decision D9's renderer half: rebuilding v1's error shape from the rejection.
 *
 * v1 could not reject with structure. Electron's `invoke` serialises only an
 * `Error`'s `name` and `message`, so the main process re-packed every `IpcError`
 * as `new Error('__IPC_ERROR__' + JSON.stringify({ code, message, details }))`
 * and the preload's `rehydrateInvokeError` searched the message for that marker
 * and rebuilt the fields. D9 deletes the sentinel server-side — Tauri rejects
 * with a real serialised payload — so the decoding moves here and the encoding
 * has no port at all.
 *
 * What has to come out the other side is unchanged, because 205 call sites and
 * four frozen code registries read it: an `Error` instance whose `name` is
 * `IpcError`, whose `message` is the handler's own text with no transport
 * envelope around it, and which carries `code` and (when there is one) `details`
 * as own properties so `isIpcError(e)` narrows and `switch (e.code)` hits.
 */

import type { IpcErrorPayload } from '@shiranami/contracts';

/** An `Error` carrying the fields `isIpcError` narrows to. */
type RehydratedError = Error & { code: string; details?: unknown };

/**
 * Whether a rejection is the `ErrorPayload` the Rust command layer produces.
 *
 * Structural, like `isIpcError` itself, and for the same reason: this value
 * crossed a serialisation boundary, so it has no prototype to test.
 */
function isErrorPayload(value: unknown): value is IpcErrorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

/**
 * Rebuild the renderer-visible error v1's preload produced.
 *
 * Three inputs, because Tauri rejects with three kinds of thing:
 *
 * - The command layer's `{ code, message, details }` — every failure a command
 *   returns, since `crate::error` makes each one code-bearing. This is the case
 *   that has to match v1 exactly.
 * - A bare string, which is what the invoke transport itself rejects with for
 *   failures below the command layer: an unregistered command name, an argument
 *   serde could not shape. v1's equivalent was an `Error` with Electron's
 *   `Error invoking remote method '<ch>': ` prefix stripped off, so an `Error`
 *   carrying just the text is the closest true statement — and deliberately
 *   *without* a `code`, because inventing one would tell `switch (e.code)` that
 *   a transport fault was a domain outcome.
 * - Anything else passes through untouched, including an `Error` a narrower or
 *   the shim's own zod parse threw. Wrapping those would double-wrap the one
 *   case that is already correct.
 */
export function rehydrate(rejection: unknown): unknown {
  if (isErrorPayload(rejection)) {
    const error = new Error(rejection.message) as RehydratedError;
    error.name = 'IpcError';
    error.code = rejection.code;
    // `null` counts as absent, not as a value. v1's encoder omitted the key
    // entirely when there were no details, so the decoded error had no such
    // property; `ErrorPayload.details` is a plain `Option` with no
    // skip-serializing, so `None` arrives as an explicit `null`. Assigning it
    // would give the renderer a property v1 never set.
    if (rejection.details !== undefined && rejection.details !== null) {
      error.details = rejection.details;
    }
    return error;
  }

  if (typeof rejection === 'string') return new Error(rejection);

  return rejection;
}

/**
 * Wrap every method of a generated binding object so its rejections rehydrate.
 *
 * A proxy rather than 137 hand-written call-site wrappers. The wrappers would be
 * a second list parallel to the generated one, maintained by hand, which is the
 * exact failure this repo has already had once — the preload's channel allowlist
 * drifted by seven channels while looking correct. A chokepoint cannot drift,
 * and v1 had the same one shape: every `api/*` module reached the main process
 * through a single `invoke` wrapper.
 *
 * Wrapped functions are cached per property so repeated reads return the same
 * reference, which keeps them usable as effect dependencies.
 */
export function withRehydratedRejections<T extends object>(source: T): T {
  const wrapped = new Map<PropertyKey, unknown>();

  return new Proxy(source, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;

      const cached = wrapped.get(property);
      if (cached !== undefined) return cached;

      const call = value as (...args: unknown[]) => Promise<unknown>;
      const rehydrating = (...args: unknown[]): Promise<unknown> =>
        call.apply(target, args).catch((rejection: unknown) => {
          throw rehydrate(rejection);
        });

      wrapped.set(property, rehydrating);
      return rehydrating;
    },
  });
}
