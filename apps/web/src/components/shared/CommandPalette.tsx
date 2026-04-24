import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Heart, Radio, Settings, ListMusic, History, Download } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { useAppStore, type AppView } from '@/stores/useAppStore';
import { formatDuration } from '@shiranami/shared';

export function CommandPalette() {
  const { t } = useTranslation('commandPalette');
  const [open, setOpen] = useState(false);
  const library = useLibraryStore(s => s.library);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const navigateTo = useAppStore(s => s.navigateTo);

  // Global Cmd+K / Ctrl+K listener
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

  const handlePlayTrack = useCallback(
    (track: Track) => {
      const index = library.findIndex(t => t.id === track.id);
      if (index !== -1) {
        setQueue(library, index);
      }
      setOpen(false);
    },
    [library, setQueue]
  );

  const handleNavigate = useCallback(
    (view: AppView) => {
      navigateTo(view);
      setOpen(false);
    },
    [navigateTo]
  );

  // Memoize track items to avoid re-rendering on every keystroke
  const trackItems = useMemo(
    () =>
      library.map(track => (
        <CommandItem
          key={track.id}
          value={`${track.title} ${track.artist} ${track.album}`}
          onSelect={() => handlePlayTrack(track)}
          className="flex items-center gap-3 py-2"
        >
          <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-muted flex items-center justify-center">
            {track.albumArt ? (
              <img src={track.albumArt} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <Music className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">
              {track.title}
              {currentTrack?.id === track.id && (
                <span className="ml-2 text-primary text-xs">{t('playing')}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
          </div>
          <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
            {formatDuration(track.duration)}
          </span>
        </CommandItem>
      )),
    [library, currentTrack?.id, handlePlayTrack, t]
  );

  const navigationItems: { view: AppView; key: string; icon: React.ReactNode }[] = [
    { view: 'library', key: 'library', icon: <ListMusic className="w-4 h-4" /> },
    { view: 'favorites', key: 'favorites', icon: <Heart className="w-4 h-4" /> },
    { view: 'playlists', key: 'playlists', icon: <ListMusic className="w-4 h-4" /> },
    { view: 'history', key: 'history', icon: <History className="w-4 h-4" /> },
    { view: 'search', key: 'search', icon: <Download className="w-4 h-4" /> },
    { view: 'radio', key: 'radio', icon: <Radio className="w-4 h-4" /> },
    { view: 'settings', key: 'settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('placeholder')} />
      <CommandList>
        <CommandEmpty>{t('noResults')}</CommandEmpty>

        <CommandGroup heading={t('navigation')}>
          {navigationItems.map(item => (
            <CommandItem
              key={item.view}
              value={`go to ${t(item.key, { ns: 'sidebar' })}`}
              onSelect={() => handleNavigate(item.view)}
              className="flex items-center gap-3"
            >
              {item.icon}
              <span>{t('goTo', { view: t(item.key, { ns: 'sidebar' }) })}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {library.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('tracks')}>
              {trackItems}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
