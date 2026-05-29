import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import type { TrackMetadata } from '@/types/electron';

export interface SubfolderGroup {
  name: string;
  path: string;
  tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
}

export interface ScanAndPersistResult {
  /** Number of new tracks actually added to the library (post-dedup). */
  addedCount: number;
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
    return { addedCount: 0, subfolders: scannedSubfolders, empty: true, allExisted: false };
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
      albumArtist: r.metadata.albumArtist ?? r.metadata.artist ?? null,
      album: r.metadata.album,
      duration: r.metadata.duration,
      genre: r.metadata.genre ?? null,
      year: r.metadata.year ?? null,
      trackNumber: r.metadata.trackNumber ?? null,
      discNumber: r.metadata.discNumber ?? null,
      albumArt: r.metadata.albumArt ?? null,
    }))
  )) as DbTrackRecord[];

  const newTracks = mapDbTracksToTracks(dbTracks);

  // Persist folder to DB only after tracks were added successfully.
  // Tolerate duplicate-folder errors — re-adding an existing watched folder is a no-op.
  try {
    await window.electronAPI.db.folders.add(dirPath);
  } catch {
    // Folder may already be registered, that's fine.
  }

  useLibraryStore.getState().addToLibrary(newTracks);

  usePlaybackStore.getState().enqueueTracks(newTracks, 'first');

  return {
    addedCount: newTracks.length,
    subfolders: scannedSubfolders,
    empty: false,
    allExisted: false,
  };
}
