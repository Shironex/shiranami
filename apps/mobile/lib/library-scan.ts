import type { SQLiteDatabase } from 'expo-sqlite';
import type { AudioLibraryModule, MediaAudio, TrackTags } from '@/modules/audio-library';
import { trackFields, type TrackFields } from '@/lib/track-meta';
import { randomUUID } from '@/lib/utils';

/** Files read per native call, and rows written per transaction. */
export const READ_BATCH = 24;

/** What the scan and the import need from the platform; injected so tests can fake it. */
export interface LibraryDeps {
  /** Null where the native module is not built in; import then falls back to filenames. */
  native: AudioLibraryModule | null;
  /** Where covers are saved, as a `file://` uri. */
  artDir: string;
  /** Copies a picked file into app storage under `name`; returns the copy's uri. */
  copyIn: (sourceUri: string, name: string) => string;
  /** Deletes a copy in app storage that a device file replaced. Best effort. */
  removeCopy: (uri: string) => void;
}

/** A `tracks` row as far as identity and rescans care. */
export interface KnownRow {
  id: string;
  file_path: string;
  content_hash: string | null;
  file_size: number | null;
  file_modified: number | null;
  source: string;
  missing: number;
}

export interface ScanPlan {
  /** Files with no row yet. */
  added: MediaAudio[];
  /** Files whose row exists but is stale: size or date moved, never hashed, or marked missing. */
  changed: { id: string; item: MediaAudio }[];
  /** Device rows whose file is gone. */
  missing: string[];
  unchanged: number;
}

export interface ScanProgress {
  done: number;
  total: number;
}

export interface ScanResult {
  /** Music files the phone reported. */
  found: number;
  added: number;
  updated: number;
  /** Rows re-pointed at a new uri: a moved file, or an imported copy now found on the device. */
  moved: number;
  /** Files skipped because a row with the same content hash is already present. */
  duplicates: number;
  missing: number;
  failed: number;
  cancelled: boolean;
}

export interface CancelToken {
  cancelled: boolean;
}

/** Splits what MediaStore reports against what the library already holds. */
export function planScan(rows: KnownRow[], found: MediaAudio[]): ScanPlan {
  const byPath = new Map(rows.map(row => [row.file_path, row]));
  const seen = new Set<string>();
  const plan: ScanPlan = { added: [], changed: [], missing: [], unchanged: 0 };

  for (const item of found) {
    seen.add(item.uri);
    const row = byPath.get(item.uri);
    if (!row) {
      plan.added.push(item);
    } else if (
      row.missing ||
      row.content_hash == null ||
      row.file_size !== item.size ||
      row.file_modified !== item.modified
    ) {
      plan.changed.push({ id: row.id, item });
    } else {
      plan.unchanged++;
    }
  }

  for (const row of rows) {
    if (row.source === 'device' && !row.missing && !seen.has(row.file_path)) {
      plan.missing.push(row.id);
    }
  }
  return plan;
}

const KNOWN_COLUMNS = 'id, file_path, content_hash, file_size, file_modified, source, missing';

const FIELD_COLUMNS =
  'title = ?, artist = ?, album = ?, album_artist = ?, track_number = ?, year = ?, genre = ?, duration = ?, album_art = ?';

function fieldValues(fields: TrackFields) {
  return [
    fields.title,
    fields.artist,
    fields.album,
    fields.albumArtist,
    fields.trackNumber,
    fields.year,
    fields.genre,
    fields.duration,
    fields.albumArt,
  ];
}

async function insertTrack(
  db: SQLiteDatabase,
  row: {
    filePath: string;
    fields: TrackFields;
    hash: string | null;
    size: number | null;
    modified: number | null;
    source: 'import' | 'device';
  }
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(
    `INSERT OR IGNORE INTO tracks (id, file_path, title, artist, album, album_artist, track_number,
       year, genre, duration, album_art, content_hash, file_size, file_modified, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, row.filePath, ...fieldValues(row.fields), row.hash, row.size, row.modified, row.source]
  );
  return id;
}

/** Points a row at a device file and refreshes everything read from it. */
async function updateFromDevice(
  db: SQLiteDatabase,
  id: string,
  item: MediaAudio,
  tags: TrackTags
): Promise<void> {
  await db.runAsync(
    `UPDATE tracks SET ${FIELD_COLUMNS}, file_path = ?, content_hash = ?, file_size = ?,
       file_modified = ?, source = 'device', missing = 0, updated_at = datetime('now')
     WHERE id = ?`,
    [
      ...fieldValues(trackFields(tags, item.name)),
      item.uri,
      tags.contentHash,
      item.size,
      item.modified,
      id,
    ]
  );
}

async function readInBatches<T>(
  native: AudioLibraryModule | null,
  artDir: string,
  items: T[],
  uriOf: (item: T) => string,
  apply: (batch: { item: T; tags: TrackTags | null }[]) => Promise<void>,
  token?: CancelToken
): Promise<boolean> {
  for (let start = 0; start < items.length; start += READ_BATCH) {
    if (token?.cancelled) return false;
    const batch = items.slice(start, start + READ_BATCH);
    const tags = native
      ? await native.readTracksAsync(batch.map(uriOf), artDir)
      : batch.map(() => null);
    await apply(batch.map((item, index) => ({ item, tags: tags[index] ?? null })));
  }
  return true;
}

/**
 * The one library job that may run: expo-sqlite has a single connection, so a
 * backfill and a scan running together would open overlapping transactions.
 */
let activeJob: { kind: 'backfill' | 'scan'; stop: CancelToken; done: Promise<unknown> } | null =
  null;

/** A token that reads as cancelled when either the caller or the lock cancels it. */
function eitherToken(caller: CancelToken | undefined, stop: CancelToken): CancelToken {
  return {
    get cancelled() {
      return stop.cancelled || !!caller?.cancelled;
    },
  } as CancelToken;
}

async function runExclusive<T>(
  kind: 'backfill' | 'scan',
  stop: CancelToken,
  job: () => Promise<T>
): Promise<T> {
  const done = job();
  const entry = { kind, stop, done };
  activeJob = entry;
  try {
    return await done;
  } finally {
    if (activeJob === entry) activeJob = null;
  }
}

/**
 * Gives rows from before content hashes (manual imports on older builds) their
 * hash, and their real tags where the file has them: their titles came from
 * filenames, since the phone has no tag editor. Runs after startup, never
 * blocks it; a file that cannot be read keeps its row as it is.
 *
 * Skipped (returns 0) while a scan or another backfill runs: the scan
 * backfills first itself.
 *
 * Returns how many rows changed.
 */
export async function backfillHashes(
  db: SQLiteDatabase,
  deps: LibraryDeps,
  token?: CancelToken
): Promise<number> {
  if (!deps.native || activeJob) return 0;
  const stop: CancelToken = { cancelled: false };
  return runExclusive('backfill', stop, () => runBackfill(db, deps, eitherToken(token, stop)));
}

async function runBackfill(
  db: SQLiteDatabase,
  deps: LibraryDeps,
  token?: CancelToken
): Promise<number> {
  if (!deps.native) return 0;
  const rows = await db.getAllAsync<{ id: string; file_path: string }>(
    'SELECT id, file_path FROM tracks WHERE content_hash IS NULL AND missing = 0'
  );
  let changed = 0;
  await readInBatches(
    deps.native,
    deps.artDir,
    rows,
    row => row.file_path,
    async batch => {
      await db.withTransactionAsync(async () => {
        for (const { item, tags } of batch) {
          if (!tags) continue;
          await db.runAsync(
            `UPDATE tracks SET content_hash = ?, file_size = ?,
               title = COALESCE(?, title), artist = COALESCE(?, artist), album = COALESCE(?, album),
               album_artist = COALESCE(?, album_artist), track_number = COALESCE(?, track_number),
               year = COALESCE(?, year), genre = COALESCE(?, genre),
               duration = COALESCE(?, duration), album_art = COALESCE(?, album_art),
               updated_at = datetime('now')
             WHERE id = ?`,
            [
              tags.contentHash,
              tags.size,
              tags.title,
              tags.artist ?? tags.albumArtist,
              tags.album,
              tags.albumArtist,
              tags.trackNumber,
              tags.year,
              tags.genre,
              tags.durationMs ? tags.durationMs / 1000 : null,
              tags.artUri,
              item.id,
            ]
          );
          changed++;
        }
      });
    },
    token
  );
  return changed;
}

interface ScanOptions {
  token?: CancelToken;
  onProgress?: (progress: ScanProgress) => void;
  /** After each committed batch, with the running count of rows added or changed. */
  onBatch?: (written: number) => void;
}

/**
 * Brings the library in line with the music on the phone: new files are
 * added, changed ones re-read, gone ones marked missing. Files are played in
 * place by content uri, never copied.
 *
 * One row per content hash: a file whose hash is already present is skipped,
 * unless that row's own file is gone or is an imported copy, in which case
 * the row (with its favorite, plays and playlists) is re-pointed at the file.
 */
export async function scanLibrary(
  db: SQLiteDatabase,
  deps: LibraryDeps & { native: AudioLibraryModule },
  options: ScanOptions = {}
): Promise<ScanResult> {
  // Take over from a background backfill (it stops after its current batch),
  // or wait for an earlier scan to finish.
  while (activeJob) {
    const previous = activeJob;
    if (previous.kind === 'backfill') previous.stop.cancelled = true;
    await previous.done.catch(() => undefined);
  }
  const stop: CancelToken = { cancelled: false };
  return runExclusive('scan', stop, () => runScan(db, deps, options));
}

async function runScan(
  db: SQLiteDatabase,
  deps: LibraryDeps & { native: AudioLibraryModule },
  options: ScanOptions
): Promise<ScanResult> {
  const { token, onProgress, onBatch } = options;
  // Old rows need their hash before a device file can be matched to them.
  await runBackfill(db, deps, token);

  const found = await deps.native.queryAudioAsync();
  const rows = await db.getAllAsync<KnownRow>(`SELECT ${KNOWN_COLUMNS} FROM tracks`);
  const plan = planScan(rows, found);

  const byHash = new Map<string, KnownRow>();
  for (const row of rows) if (row.content_hash) byHash.set(row.content_hash, row);
  const gone = new Set(plan.missing);
  const copiesToRemove: string[] = [];

  const result: ScanResult = {
    found: found.length,
    added: 0,
    updated: 0,
    moved: 0,
    duplicates: 0,
    missing: 0,
    failed: 0,
    cancelled: false,
  };
  const work: { id: string | null; item: MediaAudio }[] = [
    ...plan.changed,
    ...plan.added.map(item => ({ id: null, item })),
  ];
  let done = 0;
  onProgress?.({ done, total: work.length });

  const finished = await readInBatches(
    deps.native,
    deps.artDir,
    work,
    entry => entry.item.uri,
    async batch => {
      await db.withTransactionAsync(async () => {
        for (const { item: entry, tags } of batch) {
          const { id, item } = entry;
          if (!tags) {
            result.failed++;
            continue;
          }
          if (id) {
            await updateFromDevice(db, id, item, tags);
            byHash.set(tags.contentHash, rowOf(id, item, tags));
            result.updated++;
            continue;
          }
          const existing = byHash.get(tags.contentHash);
          if (existing) {
            const replaceable =
              existing.source === 'import' || existing.missing || gone.has(existing.id);
            if (!replaceable) {
              result.duplicates++;
              continue;
            }
            await updateFromDevice(db, existing.id, item, tags);
            if (existing.source === 'import') copiesToRemove.push(existing.file_path);
            gone.delete(existing.id);
            byHash.set(tags.contentHash, rowOf(existing.id, item, tags));
            result.moved++;
            continue;
          }
          const newId = await insertTrack(db, {
            filePath: item.uri,
            fields: trackFields(tags, item.name),
            hash: tags.contentHash,
            size: item.size,
            modified: item.modified,
            source: 'device',
          });
          byHash.set(tags.contentHash, rowOf(newId, item, tags));
          result.added++;
        }
      });
      done += batch.length;
      onProgress?.({ done, total: work.length });
      onBatch?.(result.added + result.updated + result.moved);
    },
    token
  );

  // The listing is complete even when reading stopped early, so missing files
  // are marked either way. A moved file not read yet is re-pointed next scan.
  const missingIds = [...gone];
  for (let start = 0; start < missingIds.length; start += 500) {
    const slice = missingIds.slice(start, start + 500);
    await db.runAsync(
      `UPDATE tracks SET missing = 1, updated_at = datetime('now')
       WHERE id IN (${slice.map(() => '?').join(', ')})`,
      slice
    );
  }
  result.missing = missingIds.length;
  for (const uri of copiesToRemove) deps.removeCopy(uri);

  result.cancelled = !finished;
  return result;
}

function rowOf(id: string, item: MediaAudio, tags: TrackTags): KnownRow {
  return {
    id,
    file_path: item.uri,
    content_hash: tags.contentHash,
    file_size: item.size,
    file_modified: item.modified,
    source: 'device',
    missing: 0,
  };
}

export interface PickedFile {
  uri: string;
  name: string;
}

export interface ImportResult {
  added: number;
  /** Already in the library (same content hash), so not copied again. */
  skipped: number;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return match ? match[1].toLowerCase() : 'mp3';
}

/**
 * Manual import: a picked file is hashed where it is first, and copied into app
 * storage (named after its hash) only when the library does not hold it yet.
 * A picker grant does not outlive the session, hence the copy.
 */
export async function importPicked(
  db: SQLiteDatabase,
  deps: LibraryDeps,
  files: PickedFile[]
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, skipped: 0 };
  await readInBatches(
    deps.native,
    deps.artDir,
    files,
    file => file.uri,
    async batch => {
      for (const { item: file, tags } of batch) {
        if (tags) {
          const existing = await db.getFirstAsync<{ id: string; missing: number }>(
            'SELECT id, missing FROM tracks WHERE content_hash = ? ORDER BY missing ASC LIMIT 1',
            [tags.contentHash]
          );
          if (existing && !existing.missing) {
            result.skipped++;
            continue;
          }
          const hex = tags.contentHash.slice(tags.contentHash.indexOf(':') + 1);
          const uri = deps.copyIn(file.uri, `${hex}.${extensionOf(file.name)}`);
          if (existing) {
            // The library knew this song but lost its file: bring the row back.
            await db.runAsync(
              `UPDATE tracks SET file_path = ?, source = 'import', missing = 0,
                 file_size = ?, updated_at = datetime('now') WHERE id = ?`,
              [uri, tags.size, existing.id]
            );
          } else {
            await insertTrack(db, {
              filePath: uri,
              fields: trackFields(tags, file.name),
              hash: tags.contentHash,
              size: tags.size,
              modified: null,
              source: 'import',
            });
          }
          result.added++;
          continue;
        }
        // Unreadable here, or no native module: import as before, from the name.
        const uri = deps.copyIn(file.uri, `${randomUUID()}.${extensionOf(file.name)}`);
        await insertTrack(db, {
          filePath: uri,
          fields: trackFields(null, file.name),
          hash: null,
          size: null,
          modified: null,
          source: 'import',
        });
        result.added++;
      }
    }
  );
  return result;
}

/** "214 songs found · 3 new · 1 missing", for the line under the scan action. */
export function describeScan(result: ScanResult): string {
  if (result.found === 0) return 'No music found on this phone';
  const parts = [`${result.found} ${result.found === 1 ? 'song' : 'songs'} found`];
  if (result.added) parts.push(`${result.added} new`);
  if (result.updated + result.moved) parts.push(`${result.updated + result.moved} updated`);
  if (result.missing) parts.push(`${result.missing} missing`);
  if (result.cancelled) parts.push('stopped early');
  return parts.join(' · ');
}
