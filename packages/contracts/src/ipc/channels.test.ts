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
});
