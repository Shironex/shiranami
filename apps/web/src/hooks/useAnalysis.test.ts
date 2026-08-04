import { describe, expect, it } from 'vitest';
import { pendingAnalysisInput } from './useAnalysis';
import type { Track } from '@/stores/types';

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
    bpm: null,
    musicalKey: null,
    ...overrides,
  };
}

describe('pendingAnalysisInput', () => {
  it('submits tracks missing tempo or key', () => {
    const fresh = make();
    const keyOnly = make({ musicalKey: 'A minor' });
    const done = make({ bpm: 82, musicalKey: 'C major' });

    const pending = pendingAnalysisInput([fresh, keyOnly, done]);

    expect(pending.map(p => p.id).sort()).toEqual([fresh.id, keyOnly.id].sort());
  });

  it('submits nothing for a fully analysed library', () => {
    expect(pendingAnalysisInput([make({ bpm: 74, musicalKey: 'F major' })])).toEqual([]);
  });

  it('never submits radio pseudo-tracks', () => {
    const radio = make({ filePath: 'shiranami-radio://lofi-station' });
    expect(pendingAnalysisInput([radio])).toEqual([]);
  });

  it('maps to the wire input shape', () => {
    const track = make();
    expect(pendingAnalysisInput([track])).toEqual([
      { id: track.id, filePath: track.filePath, title: track.title },
    ]);
  });
});
