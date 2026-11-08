import type { SQLiteDatabase } from 'expo-sqlite';
import {
  SYNC_PROTOCOL_VERSION,
  SYNC_ROUTES,
  type ManifestTrack,
  type SyncCapability,
} from '@shiranami/contracts/sync';
import { SyncClient, SyncError, asSyncError, findHost, type SyncFetch } from '@/lib/sync-client';
import { downloadAudio, type PartialFile } from '@/lib/sync-download';
import {
  applyArtwork,
  applyManifest,
  audioFileName,
  completeDownload,
  loadDesktopIds,
  mergeFavorites,
  mergeHistory,
  mergePlaylists,
} from '@/lib/sync-library';
import { preferHost, type DesktopPeer } from '@/lib/sync-peer';

/**
 * One pull from the paired desktop, in the order the screen shows it: the
 * manifest (fast, metadata only), then favorites and playlists, then the
 * songs' audio, then covers. Every database write goes through the library
 * lock; downloads run outside it. Stops cleanly on cancel, keeping what has
 * landed and the partial file of the song in flight.
 */

export type SyncStage = 'connecting' | 'favorites' | 'playlists' | 'library' | 'covers' | 'done';

export interface SyncProgress {
  stage: SyncStage;
  /** Desktop favorites now on the phone; null until merged. */
  favorites: number | null;
  /** Desktop playlists now on the phone; null until merged. */
  playlists: number | null;
  /** Songs whose audio is here, of those that needed it this run. */
  songsDone: number;
  songsTotal: number;
  /** Songs linked by content hash instead of downloaded. */
  songsLinked: number;
  bytesLeft: number;
  coversDone: number;
  coversTotal: number;
}

export interface SyncSummary {
  downloaded: number;
  linked: number;
  failed: number;
  favorites: number;
  playlists: number;
  history: number;
}

export interface SyncDeps {
  fetch: SyncFetch;
  /** The library lock (lib/library-scan.ts `withLibraryLock`). */
  lock: <T>(job: () => Promise<T>) => Promise<T>;
  partialFile: (name: string) => PartialFile;
  /** Saves the cover for `hash` (fetching it with `client` if it is not there). Returns its uri. */
  saveArt: (client: SyncClient, hash: string, signal?: AbortSignal) => Promise<string>;
  /** Saves the peer after a run: the host that answered first, the clock skew, the time. */
  savePeer: (peer: DesktopPeer) => Promise<void>;
  now?: () => number;
}

export interface SyncOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SyncProgress) => void;
  /** After each song lands, so the library can refresh as it goes. */
  onSong?: (done: number) => void;
}

/** Finds the desktop on one of its addresses and checks it is the paired one. */
export async function connect(
  peer: DesktopPeer,
  secret: string,
  deps: Pick<SyncDeps, 'fetch' | 'now'>,
  signal?: AbortSignal
): Promise<{ client: SyncClient; capabilities: Set<SyncCapability>; skew: number }> {
  const host = await findHost(deps.fetch, peer.hosts, peer.port, signal);
  if (!host) throw new SyncError('unreachable');
  const client = new SyncClient({
    fetch: deps.fetch,
    host,
    port: peer.port,
    deviceId: peer.deviceId,
    secret,
    skew: peer.skew,
    now: deps.now,
  });
  const hello = await client.hello(signal);
  if (hello.desktopId !== peer.desktopId) throw new SyncError('unpaired', 'another desktop');
  if (hello.minProtocolVersion > SYNC_PROTOCOL_VERSION) throw new SyncError('protocol');
  const skew = Math.round(hello.serverTime - (deps.now ?? Date.now)() / 1000);
  client.setSkew(skew);
  return { client, capabilities: new Set(hello.capabilities), skew };
}

async function allPages<P extends { nextCursor: string | null; hasMore: boolean }, T>(
  fetchPage: (cursor: string | null) => Promise<P>,
  take: (page: P) => T[]
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    out.push(...take(page));
    if (!page.hasMore || !page.nextCursor) return out;
    cursor = page.nextCursor;
  }
}

/** Codes that end the whole run rather than skipping one song. */
const FATAL: SyncError['code'][] = ['cancelled', 'unpaired', 'unreachable', 'protocol'];

export async function runSync(
  db: SQLiteDatabase,
  peer: DesktopPeer,
  secret: string,
  deps: SyncDeps,
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const { signal, onSong } = options;
  const progress: SyncProgress = {
    stage: 'connecting',
    favorites: null,
    playlists: null,
    songsDone: 0,
    songsTotal: 0,
    songsLinked: 0,
    bytesLeft: 0,
    coversDone: 0,
    coversTotal: 0,
  };
  const report = (patch: Partial<SyncProgress>) => {
    Object.assign(progress, patch);
    options.onProgress?.({ ...progress });
  };
  const summary: SyncSummary = {
    downloaded: 0,
    linked: 0,
    failed: 0,
    favorites: 0,
    playlists: 0,
    history: 0,
  };
  const checkCancel = () => {
    if (signal?.aborted) throw new SyncError('cancelled');
  };

  try {
    report({});
    const { client, capabilities, skew } = await connect(peer, secret, deps, signal);
    const can = (capability: SyncCapability) => capabilities.has(capability);

    const tracks = can('manifest')
      ? await allPages(
          cursor => client.manifest(cursor, signal),
          page => page.tracks
        )
      : [];
    checkCancel();
    const plan = await deps.lock(() => applyManifest(db, tracks));
    summary.linked = plan.links.length;
    const ids = await loadDesktopIds(db);

    report({ stage: 'favorites' });
    if (can('favorites')) {
      const { trackIds } = await client.favorites(signal);
      summary.favorites = await deps.lock(() => mergeFavorites(db, trackIds, ids));
    }
    report({ favorites: summary.favorites, stage: 'playlists' });
    if (can('playlists')) {
      const { playlists } = await client.playlists(signal);
      summary.playlists = await deps.lock(() => mergePlaylists(db, playlists, ids));
    }
    report({ playlists: summary.playlists });
    if (can('history')) {
      const entries = await allPages(
        cursor => client.history(cursor, signal),
        page => page.entries
      );
      summary.history = await deps.lock(() => mergeHistory(db, entries, ids));
    }
    checkCancel();

    const downloads = can('audio-range') ? plan.downloads : [];
    let bytesLeft = downloads.reduce((sum, job) => sum + (job.track.sizeBytes ?? 0), 0);
    report({
      stage: 'library',
      songsTotal: downloads.length,
      songsLinked: plan.links.length,
      bytesLeft,
    });
    for (const job of downloads) {
      checkCancel();
      const { track } = job;
      const name = audioFileName(track.id, track.format);
      const path = SYNC_ROUTES.audio(track.id);
      let counted = 0;
      try {
        const file = await downloadAudio({
          file: deps.partialFile(name),
          expectedSize: track.sizeBytes,
          fileVersion: track.fileVersion,
          send: headers => client.request('GET', path, { headers, signal }),
          signal,
          onBytes: written => {
            bytesLeft -= written - counted;
            counted = written;
            report({ bytesLeft: Math.max(0, bytesLeft) });
          },
        });
        await deps.lock(() => completeDownload(db, job, file.uri, file.size));
        summary.downloaded++;
        onSong?.(summary.downloaded);
      } catch (error) {
        const syncError = asSyncError(error, signal);
        if (FATAL.includes(syncError.code)) throw syncError;
        summary.failed++;
      }
      bytesLeft -= (track.sizeBytes ?? 0) - counted;
      report({ songsDone: progress.songsDone + 1, bytesLeft: Math.max(0, bytesLeft) });
    }

    if (can('artwork')) await pullCovers(db, client, tracks, deps, report, signal);

    await deps.savePeer({
      ...peer,
      hosts: preferHost(peer.hosts, client.host),
      skew,
      lastSyncAt: new Date((deps.now ?? Date.now)()).toISOString(),
    });
    report({ stage: 'done' });
    return summary;
  } catch (error) {
    throw asSyncError(error, signal);
  }
}

/** Covers for linked rows that have none, one request per artwork hash. */
async function pullCovers(
  db: SQLiteDatabase,
  client: SyncClient,
  tracks: ManifestTrack[],
  deps: SyncDeps,
  report: (patch: Partial<SyncProgress>) => void,
  signal?: AbortSignal
): Promise<void> {
  const bare = new Set(
    (
      await db.getAllAsync<{ desktop_id: string }>(
        'SELECT desktop_id FROM tracks WHERE desktop_id IS NOT NULL AND album_art IS NULL'
      )
    ).map(row => row.desktop_id)
  );
  const byHash = new Map<string, string[]>();
  for (const track of tracks) {
    if (!track.artworkHash || !bare.has(track.id)) continue;
    byHash.set(track.artworkHash, [...(byHash.get(track.artworkHash) ?? []), track.id]);
  }
  report({ stage: 'covers', coversTotal: byHash.size, coversDone: 0 });
  let done = 0;
  for (const [hash, desktopIds] of byHash) {
    if (signal?.aborted) throw new SyncError('cancelled');
    try {
      const uri = await deps.saveArt(client, hash, signal);
      await deps.lock(() =>
        applyArtwork(
          db,
          desktopIds.map(desktopId => ({ desktopId, uri }))
        )
      );
    } catch (error) {
      const syncError = asSyncError(error, signal);
      if (FATAL.includes(syncError.code)) throw syncError;
      // A missing cover leaves the placeholder art; the next sync tries again.
    }
    report({ coversDone: ++done });
  }
}
