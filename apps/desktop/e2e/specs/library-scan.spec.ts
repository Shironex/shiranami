/**
 * Scanning a folder off the real filesystem.
 *
 * The unit tests for the scanner run against fixtures the test itself wrote into
 * a `tempfile::TempDir`; what they cannot cover is the seam this spec exercises —
 * a directory chosen by the renderer, walked by Rust, with the results crossing
 * the IPC as a typed payload and then going back the other way as rows. Every
 * link in that chain is real here, including the one that only exists on macOS:
 * `HOME` is redirected, so `~/Music` is inside the profile and a scan cannot
 * reach the developer's actual library.
 */

import fs from 'node:fs';
import path from 'node:path';

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell, resetLibrary } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { waitForLogLine } from '../helpers/logs.js';
import { writeTracks, silentWav } from '../helpers/audio.js';

const MEDIA = profile('library').mediaDir;
const HOME = profile('library').home;

describe('library scan', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  beforeEach(async () => {
    await resetLibrary();
  });

  it('finds every audio file in a folder', async () => {
    const dir = path.join(MEDIA, 'scan-basic');
    fs.rmSync(dir, { recursive: true, force: true });
    const files = writeTracks(dir, 3);

    const results = await browser.execute(
      async dirPath => window.electronAPI.library.scanFolder(dirPath),
      dir
    );

    expect(results).toHaveLength(3);
    expect(results.map(result => result.filePath).sort()).toEqual([...files].sort());
  });

  it('ignores files that are not audio', async () => {
    const dir = path.join(MEDIA, 'scan-mixed');
    fs.rmSync(dir, { recursive: true, force: true });
    const files = writeTracks(dir, 1);
    fs.writeFileSync(path.join(dir, 'cover.jpg'), Buffer.from('ffd8ff', 'hex'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not music');
    fs.writeFileSync(path.join(dir, '.DS_Store'), Buffer.alloc(8));

    const results = await browser.execute(
      async dirPath => window.electronAPI.library.scanFolder(dirPath),
      dir
    );

    expect(results.map(result => result.filePath)).toEqual(files);
  });

  it('descends into subdirectories', async () => {
    const dir = path.join(MEDIA, 'scan-nested');
    fs.rmSync(dir, { recursive: true, force: true });
    const top = writeTracks(dir, 1);
    const nested = writeTracks(path.join(dir, 'album', 'disc-1'), 2);

    const results = await browser.execute(
      async dirPath => window.electronAPI.library.scanFolder(dirPath),
      dir
    );

    expect(results.map(result => result.filePath).sort()).toEqual([...top, ...nested].sort());
  });

  it('returns an empty list for a folder with no audio', async () => {
    const dir = path.join(MEDIA, 'scan-empty');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    expect(
      await browser.execute(async dirPath => window.electronAPI.library.scanFolder(dirPath), dir)
    ).toEqual([]);
  });

  it('reports a missing folder as empty, and says so only in the log', async () => {
    // Asserted as the behaviour it is rather than the behaviour one might want.
    //
    // `discover_files` walks with `WalkDir` and, on a walk error, logs
    // `failed to scan directory` at WARN and continues — so a root that does not
    // exist produces an empty list and a resolved promise, indistinguishable at
    // the IPC from a folder that genuinely holds no audio. The renderer
    // therefore cannot tell "nothing to import" from "the folder you picked has
    // been moved or unmounted", and an add-folder flow will report success over
    // a vanished drive.
    //
    // That is a real gap, but it is the backend's documented shape and not this
    // suite's to change; pinning it here means a future fix that starts
    // rejecting will fail this test loudly rather than silently altering what
    // the add-folder flow does.
    const missing = path.join(MEDIA, 'definitely-not-here');

    const outcome = await browser.execute(async dirPath => {
      try {
        return { rejected: false, results: await window.electronAPI.library.scanFolder(dirPath) };
      } catch (error) {
        return {
          rejected: true,
          message: error instanceof Error ? error.message : String(error),
          results: [],
        };
      }
    }, missing);

    expect(outcome.rejected).toBe(false);
    expect(outcome.results).toEqual([]);

    await waitForLogLine(HOME, 'failed to scan directory', { timeout: 10_000 });
  });

  it('groups loose files and subdirectories the way the add-folder flow reads them', async () => {
    // `scan_folder` — everything above — has **no production caller**; its own
    // doc comment says it survives because this suite drives it. The add-folder,
    // rescan and onboarding flows all call `scan_folder_grouped`. So the flat
    // form alone would leave the path users actually take untested.
    const dir = path.join(MEDIA, 'scan-grouped');
    fs.rmSync(dir, { recursive: true, force: true });
    const loose = writeTracks(dir, 1);
    const albumOne = writeTracks(path.join(dir, 'Album One'), 2);
    const albumTwo = writeTracks(path.join(dir, 'Album Two'), 1);
    // No audio beneath it, so it must not appear as an empty group — that guard
    // is what stops the UI offering to make a playlist out of nothing.
    fs.mkdirSync(path.join(dir, 'Artwork'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Artwork', 'front.jpg'), Buffer.from('ffd8ff', 'hex'));

    const grouped = await browser.execute(
      async dirPath => window.electronAPI.library.scanFolderGrouped(dirPath),
      dir
    );

    expect(grouped.rootTracks.map(track => track.filePath)).toEqual(loose);
    expect(grouped.subfolders.map(folder => folder.name).sort()).toEqual([
      'Album One',
      'Album Two',
    ]);

    const byName = Object.fromEntries(grouped.subfolders.map(folder => [folder.name, folder]));
    expect(byName['Album One'].tracks.map(track => track.filePath).sort()).toEqual(
      [...albumOne].sort()
    );
    expect(byName['Album Two'].tracks.map(track => track.filePath)).toEqual(albumTwo);
  });

  it('imports the scan result into the library', async () => {
    const dir = path.join(MEDIA, 'scan-import');
    fs.rmSync(dir, { recursive: true, force: true });
    writeTracks(dir, 2, index => silentWav(index + 1));

    const imported = await browser.execute(async dirPath => {
      const found = await window.electronAPI.library.scanFolder(dirPath);
      return window.electronAPI.db.tracks.addMany(
        found.map((result, index) => ({
          title: result.metadata.title ?? `Untitled ${index + 1}`,
          artist: result.metadata.artist ?? 'Unknown Artist',
          album: result.metadata.album ?? 'Unknown Album',
          filePath: result.filePath,
          duration: 1,
          genre: null,
        }))
      );
    }, dir);

    expect(imported).toHaveLength(2);

    const stored = await browser.execute(async () => window.electronAPI.db.tracks.getAll());
    expect(stored).toHaveLength(2);
    expect(stored.every(track => track.filePath.startsWith(dir))).toBe(true);
  });

  it('does not duplicate rows when the same folder is imported twice', async () => {
    // `tracks.file_path` is UNIQUE, and re-importing a watched folder is the
    // single most common way a user hits that constraint. The upsert has to
    // absorb it silently rather than failing the whole batch.
    const dir = path.join(MEDIA, 'scan-twice');
    fs.rmSync(dir, { recursive: true, force: true });
    writeTracks(dir, 2);

    const importOnce = async () =>
      browser.execute(async dirPath => {
        const found = await window.electronAPI.library.scanFolder(dirPath);
        await window.electronAPI.db.tracks.addMany(
          found.map((result, index) => ({
            title: result.metadata.title ?? `Untitled ${index + 1}`,
            artist: 'Test Artist',
            album: 'Test Album',
            filePath: result.filePath,
            duration: 1,
            genre: null,
          }))
        );
        return (await window.electronAPI.db.tracks.getAll()).length;
      }, dir);

    expect(await importOnce()).toBe(2);
    expect(await importOnce()).toBe(2);
  });

  it('remembers a watched folder and forgets it on request', async () => {
    const dir = path.join(MEDIA, 'watched');
    fs.mkdirSync(dir, { recursive: true });

    const added = await browser.execute(
      async dirPath => window.electronAPI.db.folders.add(dirPath),
      dir
    );
    expect(added.path).toBe(dir);

    const all = await browser.execute(async () => window.electronAPI.db.folders.getAll());
    expect(all.map(folder => folder.path)).toContain(dir);

    await browser.execute(async id => window.electronAPI.db.folders.remove(id), added.id);
    expect(await browser.execute(async () => window.electronAPI.db.folders.getAll())).toEqual([]);
  });
});
