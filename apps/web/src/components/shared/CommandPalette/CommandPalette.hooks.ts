import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useViewStore, type AppView } from '@/stores/useViewStore';
import type { Track } from '@/stores/types';
import type { ICommandPaletteView } from './CommandPalette.types';

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

  return {
    t,
    open,
    setOpen,
    // Gated on `open` so the full library is never mapped while the palette is closed.
    tracks: open ? library : [],
    currentTrackId: currentTrack?.id,
    hasTracks: library.length > 0,
    onPlayTrack,
    onNavigate,
  };
}
