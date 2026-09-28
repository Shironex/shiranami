import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import type { TrackMetadata } from '@/types/electron';
import type { Track } from '@/stores/types';

export interface SubfolderGroup {
  name: string;
  path: string;
  tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
}

export interface ScanAndPersistResult {
  /** Number of new tracks actually added to the library (post-dedup). */
  addedCount: number;
  /**
   * Ids of library tracks whose file had moved or been renamed. The import
   * re-pointed their existing rows at the new paths (same id, history kept),
   * and the library store now holds the new paths.
   */
  movedIds: string[];
  /** All subfolders detected in the scan (even if tracks already existed). */
  subfolders: SubfolderGroup[];
  /** Whether the scan produced zero tracks at all (empty folder). */
  empty: boolean;
  /** Whether all discovered tracks were already present (nothing genuinely new). */
  allExisted: boolean;
}

/**
 * Scans a folder, persists new tracks into the DB, updates Zustand queue/library state,
 * and registers the folder in the DB. Swallows "duplicate folder" errors.
 *
 * Shared by useLibraryFolders (add-folder flow) and useLibraryRescan (rescan flow).
 */
export async function scanAndPersistFolder(dirPath: string): Promise<ScanAndPersistResult> {
  const { rootTracks, subfolders: scannedSubfolders } =
    await window.electronAPI.library.scanFolderGrouped(dirPath);

  const results = [...rootTracks, ...scannedSubfolders.flatMap(sf => sf.tracks)];

  if (results.length === 0) {
    return {
      addedCount: 0,
      movedIds: [],
      subfolders: scannedSubfolders,
      empty: true,
      allExisted: false,
    };
  }

  const existingPaths = new Set(useLibraryStore.getState().library.map(t => t.filePath));
  const newResults = results.filter(r => !existingPaths.has(r.filePath));

  const existsInDb = new Set(
    await window.electronAPI.db.tracks.existsMany(newResults.map(r => r.filePath))
  );
  const genuinelyNew = newResults.filter(r => !existsInDb.has(r.filePath));

  if (genuinelyNew.length === 0) {
    return {
      addedCount: 0,
      movedIds: [],
      subfolders: scannedSubfolders,
      empty: false,
      allExisted: true,
    };
  }

  const dbTracks = (await window.electronAPI.db.tracks.addMany(
    genuinelyNew.map(r => ({
      filePath: r.filePath,
      title: r.metadata.title,
      artist: r.metadata.artist,
      // Pass the album-artist tag through as-is (null = untagged); the scan
      // layer deliberately omits the track-artist fallback, so don't add it here.
      albumArtist: r.metadata.albumArtist ?? null,
      album: r.metadata.album,
      duration: r.metadata.duration,
      genre: r.metadata.genre ?? null,
      year: r.metadata.year ?? null,
      trackNumber: r.metadata.trackNumber ?? null,
      discNumber: r.metadata.discNumber ?? null,
      albumArt: r.metadata.albumArt ?? null,
    }))
  )) as DbTrackRecord[];

  // The import re-points a moved file's existing row instead of inserting a
  // new one, and hands it back with its old id. Those ids are already in the
  // library, which is how a move is told apart from an addition here.
  const knownIds = new Set(useLibraryStore.getState().library.map(t => t.id));
  const returned = mapDbTracksToTracks(dbTracks);
  const newTracks = returned.filter(t => !knownIds.has(t.id));
  const movedTracks = returned.filter(t => knownIds.has(t.id));

  // Persist folder to DB only after tracks were added successfully.
  // Tolerate duplicate-folder errors — re-adding an existing watched folder is a no-op.
  try {
    await window.electronAPI.db.folders.add(dirPath);
  } catch {
    // Folder may already be registered, that's fine.
  }

  // Replaces moved tracks in place (new path) and appends the new ones.
  useLibraryStore.getState().addToLibrary(returned);

  if (newTracks.length > 0) {
    usePlaybackStore.getState().enqueueTracks(newTracks, 'first');
  }

  return {
    addedCount: newTracks.length,
    movedIds: movedTracks.map(t => t.id),
    subfolders: scannedSubfolders,
    empty: false,
    // A moved track was already in the library, so a folder of nothing but
    // moves has nothing genuinely new in it.
    allExisted: newTracks.length === 0,
  };
}

/**
 * Removes the given tracks whose files are gone from disk, from the DB and the
 * library store, and returns their ids. Tracks in `keepIds` are never checked.
 *
 * Validates exactly the set it is given, so a caller can narrow it first (to
 * one folder, say). Pass the library as it stands AFTER persistence: a moved
 * file's track has by then been re-pointed at its new path, in the DB and in
 * the store, so its entry already names a file that exists. `keepIds` (the
 * moved ids) is the second guard: even a stale snapshot still holding the old
 * path cannot delete a track the import just re-pointed.
 */
export async function removeMissingTracks(
  tracks: Track[],
  keepIds: ReadonlySet<string> = new Set()
): Promise<string[]> {
  const candidates = tracks.filter(t => !keepIds.has(t.id));
  if (candidates.length === 0) return [];

  const missingPaths = await window.electronAPI.library.validateFiles(
    candidates.map(t => t.filePath)
  );
  if (missingPaths.length === 0) return [];

  const missingSet = new Set(missingPaths);
  const staleIds = candidates.filter(t => missingSet.has(t.filePath)).map(t => t.id);
  if (staleIds.length > 0) {
    await window.electronAPI.db.tracks.removeMany(staleIds);
    useLibraryStore.getState().removeFromLibrary(staleIds);
  }
  return staleIds;
}
