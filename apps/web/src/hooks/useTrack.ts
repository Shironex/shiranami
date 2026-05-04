import { useMemo } from 'react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import type { Track } from '@/stores/types';

/**
 * Read a single track with overlay merged on top.
 *
 * Returns `null` if the id is missing or the library has no track for it.
 * Memoized over `(id, library, overlay-version)` so a heart icon only
 * re-renders when *its* track's overlay or the library shape changes.
 *
 * @param id Track id, or `undefined`/`null` to bail out (returns `null`).
 * @param fallback Optional already-resolved Track (e.g. a queue track that's
 *   not in the library — radio/preview case). When provided and no library
 *   match is found, the overlay still merges on top of `fallback`.
 */
export function useTrack(id: string | undefined | null, fallback?: Track | null): Track | null {
  const library = useLibraryStore(s => s.library);
  const version = useTrackOverlayStore(s => s.version);

  return useMemo(() => {
    if (!id) return null;
    const base = library.find(t => t.id === id) ?? fallback ?? null;
    if (!base) return null;
    const overlay = useTrackOverlayStore.getState().overlays.get(id);
    if (!overlay) return base;
    // version is a primitive — bumped on every overlay mutation. Including
    // it in deps is how this hook re-runs even though the underlying Map is
    // mutated in place.
    void version;
    return { ...base, ...overlay };
  }, [id, library, fallback, version]);
}
