import type { Page } from '@playwright/test';
import { createSilentAudioFiles, type FixtureAudioFile } from './audio-fixtures';

export interface SeedTrackInput {
  filePath: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  genre?: string;
}

export interface SeededTrack {
  id: string;
  filePath: string;
  title: string;
  artist: string | null;
  album: string | null;
}

export interface SeededPlaylist {
  id: string;
  name: string;
}

export interface SeedFolder {
  id: string;
  path: string;
}

/**
 * Insert tracks via the same IPC the renderer uses (`db:tracks:add-many`),
 * which means specs exercise the production validation + cache-invalidation
 * path. Returns the persisted rows so specs can grab IDs for follow-up calls.
 */
export async function seedTracks(page: Page, tracks: SeedTrackInput[]): Promise<SeededTrack[]> {
  return page.evaluate(async payload => {
    const normalised = payload.map(t => ({
      filePath: t.filePath,
      title: t.title,
      artist: t.artist ?? 'Test Artist',
      album: t.album ?? 'Test Album',
      duration: t.duration ?? 1,
      genre: t.genre ?? null,
    }));
    const rows = (await window.electronAPI.db.tracks.addMany(normalised)) as Array<{
      id: string;
      filePath: string;
      title: string;
      artist: string | null;
      album: string | null;
    }>;
    return rows.map(r => ({
      id: r.id,
      filePath: r.filePath,
      title: r.title,
      artist: r.artist,
      album: r.album,
    }));
  }, tracks);
}

/**
 * Convenience: generate `count` silent WAVs to a tmpdir and seed matching rows.
 * Use this for any spec that wants playable tracks without caring about specific
 * filenames — most P0 / P1 flows do.
 */
export async function seedSilentTracks(
  page: Page,
  count: number,
  overrides: Partial<SeedTrackInput> & { titlePrefix?: string } = {}
): Promise<{ tracks: SeededTrack[]; audioDir: string; files: FixtureAudioFile[] }> {
  const { dir, files } = createSilentAudioFiles(count);
  const titlePrefix = overrides.titlePrefix ?? 'Test Track';
  const tracks = await seedTracks(
    page,
    files.map((f, i) => ({
      filePath: f.filePath,
      title: `${titlePrefix} ${i + 1}`,
      artist: overrides.artist,
      album: overrides.album,
      duration: overrides.duration,
      genre: overrides.genre,
    }))
  );
  return { tracks, audioDir: dir, files };
}

export async function seedPlaylist(
  page: Page,
  data: { name: string; trackIds?: string[]; description?: string }
): Promise<SeededPlaylist> {
  return page.evaluate(async payload => {
    const ipc = window.electronAPI.db.playlists;
    if (payload.trackIds && payload.trackIds.length > 0) {
      return (await ipc.createWithTracks({
        name: payload.name,
        description: payload.description,
        trackIds: payload.trackIds,
      })) as SeededPlaylist;
    }
    return (await ipc.create({
      name: payload.name,
      description: payload.description,
    })) as SeededPlaylist;
  }, data);
}

export async function seedFolder(page: Page, folderPath: string): Promise<SeedFolder> {
  return page.evaluate(async folder => {
    return (await window.electronAPI.db.folders.add(folder)) as SeedFolder;
  }, folderPath);
}

/** Wait for the persisted track count to match `expected`. Polls via IPC. */
export async function waitForTrackCount(
  page: Page,
  expected: number,
  timeoutMs = 10_000
): Promise<void> {
  await page.waitForFunction(
    async target => {
      const rows = await window.electronAPI.db.tracks.getAll();
      return rows.length === target;
    },
    expected,
    { timeout: timeoutMs }
  );
}
