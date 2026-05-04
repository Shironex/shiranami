import { useMemo } from 'react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import type { Track } from '@/stores/types';

/**
 * Library array with the per-track mutation overlay merged in.
 *
 * Cheap when the overlay is empty — returns the canonical `library` reference
 * unchanged so downstream `useMemo([library, ...])` hooks (e.g.
 * `groupTracksByAlbum` in `AlbumGrid`) keep their cached results. When
 * overlay entries exist, allocates a single new array and patches only the
 * matching ids; the rest are reused by reference.
 *
 * Memoised over `(library, overlay-version)`. Re-runs on every overlay
 * mutation but the cost is O(n) once per mutation — sub-1Hz for favorite
 * toggles, much cheaper than the full `library.map(...)` reallocation that
 * the previous `toggleFavorite` performed.
 */
export function useMergedLibrary(): Track[] {
  const library = useLibraryStore(s => s.library);
  const version = useTrackOverlayStore(s => s.version);

  return useMemo(() => {
    const overlays = useTrackOverlayStore.getState().overlays;
    if (overlays.size === 0) return library;
    // version primitive forces re-run when the in-place Map mutates.
    void version;
    return library.map(t => {
      const overlay = overlays.get(t.id);
      return overlay ? { ...t, ...overlay } : t;
    });
  }, [library, version]);
}
