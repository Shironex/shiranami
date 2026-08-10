/**
 * Does the shim actually cover v1's channel manifest, in both directions?
 *
 * The preload's answer to this question was a hand-maintained allowlist, and it
 * was wrong for seven channels — `media:command`, two downloader tool-status
 * channels and all six `updater:*` — while looking right, which made
 * `assertAllowedChannel` decorative for exactly the channels it was protecting.
 * That is the failure this file exists to make impossible, so it asserts drift
 * in **both** directions rather than only the one that is easy to check.
 *
 * Three guards, at two different times:
 *
 * 1. **Compile time.** `CHANNEL_IMPLEMENTATIONS` is typed
 *    `Record<IpcChannelName, ChannelPath>`, so a channel in the contracts
 *    manifest with no entry, or an entry naming a channel that does not exist,
 *    fails `tsc` before this file runs.
 * 2. **Compile time.** `createElectronApi()` is annotated with the renderer's
 *    own `ElectronAPI`, so a method the renderer believes in and the shim does
 *    not implement fails at the object literal.
 * 3. **Run time, here.** That each mapped path resolves to a real function on
 *    the built object, and — the direction a manifest cannot check itself — that
 *    every function the shim exposes is claimed by some channel. An
 *    implementation with no channel is how a surface grows past its contract.
 */

import { describe, expect, it } from 'vitest';
import { ALL_IPC_CHANNELS } from '@shiranami/contracts';
import { createElectronApi } from './index';
import { CHANNEL_IMPLEMENTATIONS } from './manifest';

/** Members of `electronAPI` that are values rather than channels. */
const NON_CHANNEL_MEMBERS = new Set(['platform', '__e2e', 'errors']);

/** Resolve a dotted path against the built surface. */
function resolve(root: object, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined,
    root
  );
}

/** Every function-valued leaf of the surface, as dotted paths. */
function functionPaths(node: unknown, trail: readonly string[] = []): string[] {
  if (typeof node === 'function') return [trail.join('.')];
  if (typeof node !== 'object' || node === null) return [];

  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    trail.length === 0 && NON_CHANNEL_MEMBERS.has(key) ? [] : functionPaths(value, [...trail, key])
  );
}

describe('bridge channel coverage', () => {
  const api = createElectronApi();
  const mapped = Object.entries(CHANNEL_IMPLEMENTATIONS);

  it('maps every channel in the v1 manifest', () => {
    const missing = ALL_IPC_CHANNELS.filter(channel => !(channel in CHANNEL_IMPLEMENTATIONS));

    expect(missing).toEqual([]);
    expect(mapped).toHaveLength(ALL_IPC_CHANNELS.length);
  });

  it('covers all 167 channels — 135 v1 invoke, 8 v2 invoke, 20 v1 + 4 v2 events', () => {
    expect(ALL_IPC_CHANNELS.length).toBe(167);
    expect(mapped).toHaveLength(167);
  });

  it('resolves every mapped channel to a function on the installed surface', () => {
    const unimplemented = mapped
      .filter(([, path]) => typeof resolve(api, path) !== 'function')
      .map(([channel, path]) => `${channel} -> ${path.join('.')}`);

    expect(unimplemented).toEqual([]);
  });

  it('leaves no shim method unclaimed by a channel', () => {
    const claimed = new Set(mapped.map(([, path]) => path.join('.')));
    const orphans = functionPaths(api).filter(path => !claimed.has(path));

    expect(orphans).toEqual([]);
  });

  it('names each channel exactly once', () => {
    const paths = mapped.map(([, path]) => path.join('.'));

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('exposes the 24 namespaces v1 exposed, plus analysis, doctor and companion, plus the three non-channel members', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        '__e2e',
        // v2's own (F1/F2) — no v1 counterpart.
        'analysis',
        'app',
        // v2's own (companion Phase 1) — no v1 counterpart.
        'companion',
        'db',
        'debug',
        'dialog',
        'discord',
        // v2's own (F8) — no v1 counterpart.
        'doctor',
        'downloader',
        'errors',
        'library',
        'loudness',
        'lyrics',
        'media',
        'metadata',
        'platform',
        'playlist',
        'radio',
        'recommendations',
        'scrobble',
        'share',
        'shell',
        'storage',
        'store',
        'system',
        'updater',
        'waveform',
        'weather',
        'window',
      ].sort()
    );
  });

  it('re-exposes the error registries and predicate unchanged', () => {
    expect(typeof api.errors.isIpcError).toBe('function');
    expect(api.errors.isIpcError({ code: 'share.track_not_found', message: 'x' })).toBe(true);
    expect(api.errors.isIpcError(new Error('plain'))).toBe(false);
    expect(api.errors.SHARE_ERROR_CODES.INVALID_RESPONSE).toBe('share.invalid_response');
    expect(api.errors.PLAYLIST_ERROR_CODES.UNSUPPORTED_URL).toBe('playlist.unsupported_url');
    expect(api.errors.VALIDATION_ERROR_CODES.BAD_REQUEST).toBe('BAD_REQUEST');
  });
});
