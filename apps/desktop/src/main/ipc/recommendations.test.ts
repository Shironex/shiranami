import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDatabase, initializeDatabase, getDatabase } from '@shiranami/database/client';
import { tracks, playlists, playlistTracks, negativeSignals } from '@shiranami/database';
import type { SimilarTrackResult } from '@shiranami/contracts';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../test/setup';
import { cleanupRecommendationsHandlers, registerRecommendationsHandlers } from './recommendations';

describe('recommendations:similar ipc (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    registerRecommendationsHandlers();
  });

  afterEach(() => {
    cleanupRecommendationsHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  function insertTrack(id: string, artist: string, album: string) {
    getDatabase()
      .insert(tracks)
      .values({ id, filePath: `/music/${id}.mp3`, title: id, artist, album })
      .run();
  }

  function invokeSimilar(seedId: string): Promise<SimilarTrackResult[]> {
    const handler = ipcHandlers.get('recommendations:similar')!;
    return handler(null as never, seedId) as Promise<SimilarTrackResult[]>;
  }

  it('ranks shared-artist and shared-album tracks above the rest, excluding the seed', async () => {
    insertTrack('seed', 'Nujabes', 'Modal Soul');
    insertTrack('sameArtistAndAlbum', 'Nujabes', 'Modal Soul');
    insertTrack('sameArtist', 'Nujabes', 'Spiritual State');
    insertTrack('unrelated', 'Other Artist', 'Other Album');

    const results = await invokeSimilar('seed');

    expect(results.map(r => r.trackId)).toEqual(['sameArtistAndAlbum', 'sameArtist']);
    // artist (3) + album (2) ranks strictly above artist-only (3).
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    expect(results.some(r => r.trackId === 'seed')).toBe(false);
    expect(results.some(r => r.trackId === 'unrelated')).toBe(false);
  });

  it('counts shared playlist membership as a similarity signal', async () => {
    // Untagged tracks (sentinel artist/album) so playlist co-membership is the
    // only signal that can lift a candidate above 0.
    insertTrack('seed', 'Unknown Artist', 'Unknown Album');
    insertTrack('coMember', 'Unknown Artist', 'Unknown Album');
    insertTrack('loner', 'Unknown Artist', 'Unknown Album');

    const db = getDatabase();
    db.insert(playlists).values({ id: 'pl1', name: 'Chill' }).run();
    db.insert(playlistTracks)
      .values([
        { id: 'pt1', playlistId: 'pl1', trackId: 'seed', position: 0 },
        { id: 'pt2', playlistId: 'pl1', trackId: 'coMember', position: 1 },
      ])
      .run();

    const results = await invokeSimilar('seed');

    expect(results.map(r => r.trackId)).toEqual(['coMember']);
    expect(results[0].similarity).toBe(1);
  });

  it('returns an empty list for an unknown seed', async () => {
    insertTrack('a', 'Artist', 'Album');
    expect(await invokeSimilar('does-not-exist')).toEqual([]);
  });

  it('rejects an empty seed id via zod validation', async () => {
    await expect(invokeSimilar('')).rejects.toThrow();
  });
});

describe('recommendations:not-interested ipc (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    registerRecommendationsHandlers();
  });

  afterEach(() => {
    cleanupRecommendationsHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  function insertTrack(id: string, artist: string) {
    getDatabase()
      .insert(tracks)
      .values({ id, filePath: `/music/${id}.mp3`, title: id, artist, album: 'A' })
      .run();
  }

  function invokeMark(trackId: string): Promise<void> {
    const handler = ipcHandlers.get('recommendations:not-interested')!;
    return handler(null as never, trackId) as Promise<void>;
  }

  function invokeUndo(trackId: string): Promise<void> {
    const handler = ipcHandlers.get('recommendations:undo-not-interested')!;
    return handler(null as never, trackId) as Promise<void>;
  }

  function dislikedCount(): number {
    return getDatabase().select().from(negativeSignals).all().length;
  }

  it('persists a negative signal and is idempotent per track', async () => {
    insertTrack('t1', 'Artist');
    await invokeMark('t1');
    await invokeMark('t1');
    expect(dislikedCount()).toBe(1);
  });

  it('undo removes the negative signal', async () => {
    insertTrack('t1', 'Artist');
    await invokeMark('t1');
    expect(dislikedCount()).toBe(1);
    await invokeUndo('t1');
    expect(dislikedCount()).toBe(0);
  });

  it('rejects an empty track id via zod validation', async () => {
    await expect(invokeMark('')).rejects.toThrow();
  });
});

describe('recommendations:smart-mixes ipc (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    registerRecommendationsHandlers();
  });

  afterEach(() => {
    cleanupRecommendationsHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  function insertTrack(id: string, genre: string | null, year: number | null, playCount: number) {
    getDatabase()
      .insert(tracks)
      .values({ id, filePath: `/music/${id}.mp3`, title: id, genre, year, playCount })
      .run();
  }

  function invoke(signals: { hour: number; weather?: string }) {
    const handler = ipcHandlers.get('recommendations:smart-mixes')!;
    return handler(null as never, signals) as Promise<
      Array<{ kind: string; decade?: number; trackIds: string[] }>
    >;
  }

  it('generates a focus mix from instrumental-tagged tracks', async () => {
    for (let i = 0; i < 6; i += 1) insertTrack(`f${i}`, 'lofi', 2015, i);
    // Non-focus 2010s tracks so the decade-2010 mix has a distinct track set
    // from the focus mix — otherwise content-dedup (rightly) collapses the two.
    for (let i = 0; i < 5; i += 1) insertTrack(`p${i}`, 'pop', 2012, i);
    const mixes = await invoke({ hour: 14 });
    expect(mixes.some(m => m.kind === 'focus')).toBe(true);
    expect(mixes.some(m => m.kind === 'decade' && m.decade === 2010)).toBe(true);
  });

  it('rejects an out-of-range hour via zod validation', async () => {
    await expect(invoke({ hour: 99 })).rejects.toThrow();
  });
});
