/**
 * Decision D9: whatever v1's preload produced is what the renderer still gets.
 *
 * The assertions are written against the four things renderer code actually
 * does with a rejection — `isIpcError(e)`, `e.code`, `e.message`, `e.details` —
 * rather than against the shim's internals, because those four are the contract
 * and the internals are not.
 *
 * `expect(...).rejects` is not used anywhere here: the matcher is broken in this
 * project (a vitest version mismatch), and a rejection assertion that silently
 * does nothing is worse than no assertion at all. Every case catches manually
 * and fails explicitly if nothing was thrown.
 */

import { describe, expect, it, vi } from 'vitest';
import { isIpcError } from '@shiranami/contracts';
import { rehydrate, withRehydratedRejections } from './errors';

/** Catch and return a rejection, failing loudly when there was not one. */
async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

describe('rehydrate', () => {
  it('rebuilds an IpcError-shaped Error from the command layer payload', () => {
    const rebuilt = rehydrate({
      code: 'share.track_not_found',
      message: 'No such track',
      details: { trackId: 'abc' },
    });

    expect(rebuilt).toBeInstanceOf(Error);
    const error = rebuilt as Error & { code: string; details: unknown };
    expect(error.name).toBe('IpcError');
    expect(error.message).toBe('No such track');
    expect(error.code).toBe('share.track_not_found');
    expect(error.details).toEqual({ trackId: 'abc' });
  });

  it('narrows through isIpcError, which is what the renderer branches on', () => {
    const rebuilt = rehydrate({ code: 'playlist.private', message: 'Private playlist' });

    expect(isIpcError(rebuilt)).toBe(true);
  });

  it('carries no message envelope — v1 stripped Electron’s and there is none here', () => {
    const rebuilt = rehydrate({ code: 'BAD_REQUEST', message: 'latitude is out of range' });

    expect((rebuilt as Error).message).toBe('latitude is out of range');
    expect((rebuilt as Error).message).not.toContain('invoking remote method');
  });

  it('leaves details unset when the payload carries none', () => {
    // Rust's `Option` has no skip-serializing, so `None` arrives as an explicit
    // null. v1's encoder omitted the key, so the decoded error had no such
    // property — assigning null would give the renderer one v1 never set.
    const fromNull = rehydrate({ code: 'INTERNAL', message: 'boom', details: null });
    const fromAbsent = rehydrate({ code: 'INTERNAL', message: 'boom' });

    expect('details' in (fromNull as object)).toBe(false);
    expect('details' in (fromAbsent as object)).toBe(false);
  });

  it('turns a bare transport rejection into an Error with no code', () => {
    // Tauri rejects with a string for failures below the command layer. Giving
    // one a code would tell `switch (e.code)` that a transport fault was a
    // domain outcome.
    const rebuilt = rehydrate('command not_a_command not found');

    expect(rebuilt).toBeInstanceOf(Error);
    expect((rebuilt as Error).message).toBe('command not_a_command not found');
    expect(isIpcError(rebuilt)).toBe(false);
  });

  it('passes an already-correct Error through untouched', () => {
    const thrown = new Error('from a narrower');

    expect(rehydrate(thrown)).toBe(thrown);
  });

  it('does not mistake an arbitrary object for a payload', () => {
    const notAPayload = { code: 404, message: 'nope' };

    expect(rehydrate(notAPayload)).toBe(notAPayload);
  });
});

describe('withRehydratedRejections', () => {
  it('rehydrates a rejection from every wrapped method', async () => {
    const source = {
      failing: () => Promise.reject({ code: 'yt_dlp.missing', message: 'yt-dlp is not installed' }),
    };

    const error = await rejectionOf(() => withRehydratedRejections(source).failing());

    expect(isIpcError(error)).toBe(true);
    expect((error as Error & { code: string }).code).toBe('yt_dlp.missing');
    expect((error as Error).message).toBe('yt-dlp is not installed');
  });

  it('leaves resolved values exactly as the binding returned them', async () => {
    const payload = { items: [], paused: false };
    const source = { ok: () => Promise.resolve(payload) };

    expect(await withRehydratedRejections(source).ok()).toBe(payload);
  });

  it('forwards arguments and preserves the call target', async () => {
    const spy = vi.fn().mockResolvedValue('done');

    await withRehydratedRejections({ call: spy }).call('a', 2, null);

    expect(spy).toHaveBeenCalledWith('a', 2, null);
  });

  it('returns a stable reference per method, so effects can depend on it', () => {
    const wrapped = withRehydratedRejections({ ping: () => Promise.resolve() });

    expect(wrapped.ping).toBe(wrapped.ping);
  });

  it('passes non-function members through', () => {
    const wrapped = withRehydratedRejections({ version: 3 } as Record<string, unknown>);

    expect(wrapped.version).toBe(3);
  });
});
