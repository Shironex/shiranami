import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useViewStore, type AppView } from '@/stores/useViewStore';
import { IS_ELECTRON } from '@/lib/platform';
import type { Track } from '@/stores/types';
import type { ICommandPaletteView } from './CommandPalette.types';

/** How many distinct recently-played tracks to surface at the top of the palette. */
const RECENT_LIMIT = 6;
/** Raw history rows to pull before de-duping down to {@link RECENT_LIMIT}. */
const RECENT_FETCH_LIMIT = 24;

export function useCommandPalette(): ICommandPaletteView {
  const { t } = useTranslation('commandPalette');
  const [open, setOpen] = useState(false);
  const library = useLibraryStore(s => s.library);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const navigateTo = useViewStore(s => s.navigateTo);

  // Global Cmd+K / Ctrl+K listener.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Recently-played history. Fetched only while the palette is open (and only
  // under Electron, where the history DB lives) — mirrors the library gating
  // below so nothing runs in the background while the palette is closed.
  const { data: recentEntries } = useQuery({
    queryKey: ['commandPalette', 'recent'],
    queryFn: () => window.electronAPI.db.history.getRecent({ limit: RECENT_FETCH_LIMIT }),
    enabled: open && IS_ELECTRON,
    staleTime: 60_000,
  });

  const onPlayTrack = useCallback(
    (track: Track) => {
      const index = library.findIndex(item => item.id === track.id);
      if (index !== -1) {
        setQueue(library, index);
      }
      setOpen(false);
    },
    [library, setQueue]
  );

  const onNavigate = useCallback(
    (view: AppView) => {
      navigateTo(view);
      setOpen(false);
    },
    [navigateTo]
  );

  // Resolve recent history entries back to the live library tracks they point
  // at — de-duped and capped. Only tracks still in the library are surfaced, so
  // selecting one always has something to queue.
  const recentTracks = useMemo<Track[]>(() => {
    // Gated on `open` alongside the library below — no full-library iteration
    // happens while the palette is closed.
    if (!open || !recentEntries?.length || library.length === 0) return [];
    const byId = new Map(library.map(track => [track.id, track]));
    const seen = new Set<string>();
    const result: Track[] = [];
    for (const entry of recentEntries) {
      if (seen.has(entry.trackId)) continue;
      const track = byId.get(entry.trackId);
      if (!track) continue;
      seen.add(entry.trackId);
      result.push(track);
      if (result.length >= RECENT_LIMIT) break;
    }
    return result;
  }, [open, recentEntries, library]);

  return {
    t,
    open,
    setOpen,
    // Gated on `open` so the full library is never mapped while the palette is closed.
    tracks: open ? library : [],
    recentTracks,
    currentTrackId: currentTrack?.id,
    hasTracks: library.length > 0,
    onPlayTrack,
    onNavigate,
  };
}
