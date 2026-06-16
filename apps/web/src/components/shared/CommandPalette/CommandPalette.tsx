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
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import type { AppView } from '@/stores/useViewStore';
import { formatDuration } from '@shiranami/shared';
import { useCommandPalette } from './CommandPalette.hooks';

const NAVIGATION_ITEMS: { view: AppView; key: string; icon: React.ReactNode }[] = [
  { view: 'library', key: 'library', icon: <ListMusic className="w-4 h-4" /> },
  { view: 'favorites', key: 'favorites', icon: <Heart className="w-4 h-4" /> },
  { view: 'playlists', key: 'playlists', icon: <ListMusic className="w-4 h-4" /> },
  { view: 'history', key: 'history', icon: <History className="w-4 h-4" /> },
  { view: 'search', key: 'search', icon: <Download className="w-4 h-4" /> },
  { view: 'radio', key: 'radio', icon: <Radio className="w-4 h-4" /> },
  { view: 'settings', key: 'settings', icon: <Settings className="w-4 h-4" /> },
];

export default function CommandPalette() {
  const { t, open, setOpen, tracks, currentTrackId, hasTracks, onPlayTrack, onNavigate } =
    useCommandPalette();

  const navigationRows = NAVIGATION_ITEMS.map(item => (
    <CommandItem
      key={item.view}
      value={`go to ${t(item.key, { ns: 'sidebar' })}`}
      onSelect={() => onNavigate(item.view)}
      className="flex items-center gap-3"
    >
      {item.icon}
      <span>{t('goTo', { view: t(item.key, { ns: 'sidebar' }) })}</span>
    </CommandItem>
  ));

  const trackRows = tracks.map(track => (
    <CommandItem
      key={track.id}
      value={`${track.title} ${track.artist} ${track.album}`}
      onSelect={() => onPlayTrack(track)}
      className="flex items-center gap-3 py-2"
    >
      <TrackThumbnail
        albumArt={track.albumArt}
        alt={track.title}
        className="w-8 h-8 rounded-md bg-muted"
        fallback={<Music className="w-3.5 h-3.5 text-muted-foreground/40" />}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {track.title}
          {currentTrackId === track.id && (
            <span className="ml-2 text-primary text-xs">{t('playing')}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>
      <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
        {formatDuration(track.duration)}
      </span>
    </CommandItem>
  ));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('placeholder')} />
      <CommandList>
        <CommandEmpty>{t('noResults')}</CommandEmpty>

        <CommandGroup heading={t('navigation')}>{navigationRows}</CommandGroup>

        {hasTracks && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('tracks')}>{trackRows}</CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
