import { describe, it, expect } from 'vitest';
import { ALL_IPC_CHANNELS, IPC_CHANNELS, type IpcChannelName } from './channels';

describe('IPC_CHANNELS manifest', () => {
  it('exposes every leaf as a string', () => {
    for (const channel of ALL_IPC_CHANNELS) {
      expect(typeof channel).toBe('string');
      expect(channel.length).toBeGreaterThan(0);
    }
  });

  it('contains no duplicate channel names', () => {
    const unique = new Set(ALL_IPC_CHANNELS);
    expect(unique.size).toBe(ALL_IPC_CHANNELS.length);
  });

  it('IpcChannelName accepts a known channel literal', () => {
    const channel: IpcChannelName = IPC_CHANNELS.share.track;
    expect(channel).toBe('share:track');
  });

  it('groups db channels under their domain', () => {
    expect(IPC_CHANNELS.db.tracks.getAll).toBe('db:tracks:get-all');
    expect(IPC_CHANNELS.db.playlists.createWithTracks).toBe('db:playlists:create-with-tracks');
    expect(IPC_CHANNELS.db.history.getRecent).toBe('db:history:get-recent');
  });

  it('ALL_IPC_CHANNELS is frozen', () => {
    expect(Object.isFrozen(ALL_IPC_CHANNELS)).toBe(true);
  });

  // Channel naming convention (see apps/desktop/src/main/ipc/register.ts):
  //  - two-segment `<namespace>:<action>` by default,
  //  - three-segment `<namespace>:<entity>:<action>` when a sub-feature is shared,
  //  - every segment lowercase kebab-case; sub-namespaces use a colon, not a hyphen.
  describe('naming convention', () => {
    // Each segment: lowercase alphanumerics in kebab-case (e.g. `scan-folder`,
    // `discord-rpc`, `is-maximized`). No leading/trailing/double hyphens.
    const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    it('every channel is two or three colon-separated segments', () => {
      for (const channel of ALL_IPC_CHANNELS) {
        const segments = channel.split(':');
        expect(
          segments.length,
          `${channel} must have 2 or 3 segments, got ${segments.length}`
        ).toBeGreaterThanOrEqual(2);
        expect(
          segments.length,
          `${channel} must have 2 or 3 segments, got ${segments.length}`
        ).toBeLessThanOrEqual(3);
      }
    });

    it('every segment is lowercase kebab-case (no hyphenated sub-namespaces)', () => {
      for (const channel of ALL_IPC_CHANNELS) {
        for (const segment of channel.split(':')) {
          expect(segment, `segment "${segment}" of ${channel} is not kebab-case`).toMatch(SEGMENT);
        }
      }
    });

    it('three-segment channels share their <namespace>:<entity> sub-feature with a sibling', () => {
      // A lone three-segment channel should have been two-segment — the third
      // colon is only earned when 2+ channels share the sub-feature prefix.
      const subFeatureCounts = new Map<string, number>();
      for (const channel of ALL_IPC_CHANNELS) {
        const segments = channel.split(':');
        if (segments.length === 3) {
          const prefix = `${segments[0]}:${segments[1]}`;
          subFeatureCounts.set(prefix, (subFeatureCounts.get(prefix) ?? 0) + 1);
        }
      }
      for (const [prefix, count] of subFeatureCounts) {
        expect(
          count,
          `sub-feature ${prefix}:* has only one channel; flatten to two segments`
        ).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
