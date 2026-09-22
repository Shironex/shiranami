import { describe, expect, it } from 'vitest';
import { pendingLoudnessInput } from './useLoudnessAnalysis';
import type { Track } from '@/stores/types';

/**
 * The album-aware pending set (F5). What must hold: albums submit
 * all-or-nothing (the fold needs every member's analyser state in one run),
 * fully-profiled albums submit nothing, untagged tracks submit alone, radio
 * pseudo-tracks never submit, and the unknown-album display string is
 * un-collapsed back to "no album".
 */

let nextId = 0;
function make(overrides: Partial<Track> = {}): Track {
  nextId += 1;
  return {
    id: `t${nextId}`,
    title: `Track ${nextId}`,
    artist: 'Aoi',
    album: 'Nocturne',
    duration: 200,
    filePath: `/music/${nextId}.mp3`,
    loudnessLufs: null,
    albumLoudnessLufs: null,
    truePeakDb: null,
    ...overrides,
  };
}

const profiled = {
  loudnessLufs: -14,
  truePeakDb: -1.5,
  albumLoudnessLufs: -13.5,
};

describe('pendingLoudnessInput', () => {
  it('submits a whole album when any member is pending', () => {
    const done = make({ ...profiled });
    const fresh = make({});

    const pending = pendingLoudnessInput([done, fresh]);

    expect(pending.map(p => p.id).sort()).toEqual([done.id, fresh.id].sort());
    expect(pending[0].album).toBe('Nocturne');
    expect(pending[0].albumArtist).toBe('Aoi');
  });

  it('submits nothing for a fully profiled album', () => {
    expect(pendingLoudnessInput([make({ ...profiled }), make({ ...profiled })])).toEqual([]);
  });

  it('re-submits an album whose members lack only the album value', () => {
    const half = { loudnessLufs: -14, truePeakDb: -1.5, albumLoudnessLufs: null };
    const pending = pendingLoudnessInput([make(half), make(half)]);
    expect(pending).toHaveLength(2);
  });

  it('a v1-analysed track still owes its true peak', () => {
    const v1Row = make({ album: '', loudnessLufs: -12, truePeakDb: null });
    const pending = pendingLoudnessInput([v1Row]);
    expect(pending).toHaveLength(1);
    expect(pending[0].album).toBeNull();
  });

  it('untagged tracks submit alone and never drag others along', () => {
    const untaggedDone = make({ album: '', loudnessLufs: -12, truePeakDb: -1 });
    const untaggedFresh = make({ album: '' });

    const pending = pendingLoudnessInput([untaggedDone, untaggedFresh]);

    expect(pending.map(p => p.id)).toEqual([untaggedFresh.id]);
  });

  it('the unknown-album display string reads as "no album"', () => {
    // The mapper collapses a NULL album to the localized unknown-album string;
    // the pending set must un-collapse it or the whole untagged pile would
    // fold into one giant pseudo-album.
    const pileA = make({ album: 'Unknown Album' });
    const pileB = make({ album: 'Unknown Album', artist: 'Kaze' });

    const pending = pendingLoudnessInput([pileA, pileB]);

    expect(pending).toHaveLength(2);
    expect(pending.every(p => p.album === null)).toBe(true);
  });

  it('radio pseudo-tracks never submit', () => {
    const radio = make({ filePath: 'shiranami-radio://lofi-24-7' });
    expect(pendingLoudnessInput([radio])).toEqual([]);
  });

  it('same-named albums by different artists stay separate submissions', () => {
    const hitsByAoi = make({ album: 'Hits', albumArtist: 'Aoi', ...profiled });
    const hitsByKaze = make({ album: 'Hits', albumArtist: 'Kaze' });

    const pending = pendingLoudnessInput([hitsByAoi, hitsByKaze]);

    // Aoi's record is settled; only Kaze's submits.
    expect(pending.map(p => p.id)).toEqual([hitsByKaze.id]);
  });
});
