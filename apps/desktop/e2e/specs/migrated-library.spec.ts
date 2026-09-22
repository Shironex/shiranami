/**
 * First-run continuity: a v1 Electron profile adopted by v2 on first launch.
 *
 * This is the scenario §3 exists for and the one with the least room to be
 * wrong — a user upgrading finds their library or they do not. The Rust side
 * has unit coverage (`shiranami-db`'s `first_run_continuity.rs`, `migrate::run`'s
 * own tests), but those build the v1 tree in-process and assert on the copy.
 * What only an E2E can say is that the copied database is the one the *running
 * app opened*, that its rows reach the renderer through the production IPC, and
 * that the settings came across as settings rather than as a file.
 *
 * The profile is staged once in `onPrepare`, before any launch, and this
 * capability's first spec is the one that observes the adoption. Nothing here
 * migrates anything itself.
 */

import fs from 'node:fs';
import path from 'node:path';

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell } from '../helpers/app.js';
import { profile, settingsValue } from '../helpers/profile.js';
import { v2DataDir, v1DataDir } from '../helpers/paths.js';
import { readLog, waitForLogLine } from '../helpers/logs.js';
import { MIGRATED_ALBUM, MIGRATED_TITLES, MIGRATED_ARTISTS } from '../helpers/v1-profile.js';

const HOME = profile('migrated').home;
const V2 = v2DataDir(HOME);
const V1 = v1DataDir(HOME);

describe('migrated library', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  it('reports the migration in the boot log', async () => {
    const line = await waitForLogLine(HOME, 'first-run data continuity', { timeout: 30_000 });

    // `Outcome::Migrated` — not `Skipped`, which is what a profile that already
    // had a v2 database would produce, and not `NothingToDo`.
    expect(line).toContain('Migrated');
    expect(readLog(HOME)).toContain('the v1 library was migrated');
  });

  it('opened the migrated database, not a fresh one', async () => {
    const tracks = await browser.execute(async () => window.electronAPI.db.tracks.getAll());

    expect(tracks).toHaveLength(MIGRATED_TITLES.length);
    expect(tracks.map(track => track.title).sort()).toEqual([...MIGRATED_TITLES].sort());
    expect(tracks.every(track => track.album === MIGRATED_ALBUM)).toBe(true);
    expect([...new Set(tracks.map(track => track.artist))].sort()).toEqual(
      [...new Set(MIGRATED_ARTISTS)].sort()
    );
  });

  it('kept the absolute file paths a v1 user had', async () => {
    // v1 stored wherever the user's music actually lived, and the stager puts
    // the audio *outside* the profile for exactly that reason. A migration that
    // rewrote paths into the new data directory would break every row.
    const tracks = await browser.execute(async () => window.electronAPI.db.tracks.getAll());

    for (const track of tracks) {
      expect(path.isAbsolute(track.filePath)).toBe(true);
      expect(track.filePath.startsWith(V2)).toBe(false);
      expect(fs.existsSync(track.filePath)).toBe(true);
    }
  });

  it('carried the settings across as settings', async () => {
    // `config.json` is byte-compatible between electron-store and `core::store`,
    // so §3.4 makes copying the file *be* the key-by-key import. The proof that
    // it worked is not the file's presence but the backend answering a `store`
    // read with the v1 values.
    expect(settingsValue(HOME, 'theme')).toBe('dark');
    expect(settingsValue(HOME, 'player.volume')).toBe(0.5);

    const throughIpc = await browser.execute(async () => ({
      theme: await window.electronAPI.store.get<string>('theme'),
      volume: await window.electronAPI.store.get<number>('player.volume'),
    }));

    expect(throughIpc.theme).toBe('dark');
    expect(throughIpc.volume).toBe(0.5);
  });

  it('copied the content-addressed caches', async () => {
    expect(fs.existsSync(path.join(V2, 'album-art', 'deadbeef.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(V2, 'waveform-peaks', 'cafe.json'))).toBe(true);
  });

  it('left the Electron-only junk behind', async () => {
    // The allowlist is the whole point of §3.1: a v1 userData is mostly Chromium
    // cache, and carrying it would copy hundreds of megabytes of files v2 cannot
    // read. Their absence is the assertion.
    expect(fs.existsSync(path.join(V2, 'Cache'))).toBe(false);
    expect(fs.existsSync(path.join(V2, 'Preferences'))).toBe(false);

    // And the v1 tree itself is left intact — the migration copies, never moves,
    // so a user who downgrades still has a working v1 install.
    expect(fs.existsSync(path.join(V1, 'shiranami.db'))).toBe(true);
    expect(fs.existsSync(path.join(V1, 'Cache', 'data_0'))).toBe(true);
  });

  it('does not migrate a second time', async () => {
    // The marker is the durable record. A reload does not re-run boot, so this
    // asserts the *log* has exactly one adoption in it — a second one would mean
    // the marker was not written or not read.
    const adoptions = readLog(HOME)
      .split('\n')
      .filter(line => line.includes('the v1 library was migrated'));

    expect(adoptions).toHaveLength(1);
  });

  it('serves the migrated rows to the renderer as playable tracks', async () => {
    // The last link: rows in the copied database reaching the UI through the
    // same query path a normal library uses.
    const titles = await browser.execute(() =>
      window
        .__shiranami!.stores.library.getState()
        .library.map(track => track.title)
        .sort()
    );

    expect(titles).toEqual([...MIGRATED_TITLES].sort());
  });
});
