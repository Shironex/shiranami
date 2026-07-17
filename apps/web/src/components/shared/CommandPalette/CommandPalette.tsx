import { Music } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { SIDEBAR_NAV_ITEMS } from '@/lib/sidebar-items';
import { NAV_VIEWS } from '@/hooks/useKeyboardShortcuts';
import { IS_MAC } from '@/lib/platform';
import type { Track } from '@/stores/types';
import { formatDuration } from '@shiranami/shared';
import { useCommandPalette } from './CommandPalette.hooks';

// Number-key shortcut (1–9) for each navigable view, derived from the keyboard
// handler's NAV_VIEWS so the palette's hints can never drift from the actual
// bindings. Views without a number binding (overview, smart-playlists,
// downloads) simply render no hint.
const NAV_SHORTCUTS = new Map(NAV_VIEWS.map((entry, i) => [entry.view, String(i + 1)]));

// Enter glyph: the return-key symbol on macOS, the spelled-out key elsewhere.
const ENTER_KEY = IS_MAC ? '↵' : 'Enter';

/** A single kbd + label pair for the footer hint strip. */
function FooterHint({ keyLabel, label }: { keyLabel: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted/40 px-1 text-[0.65rem] font-medium leading-none text-muted-foreground">
        {keyLabel}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

export default function CommandPalette() {
  const {
    t,
    open,
    setOpen,
    tracks,
    recentTracks,
    currentTrackId,
    hasTracks,
    onPlayTrack,
    onNavigate,
  } = useCommandPalette();

  // Recent rows and library rows can point at the same track; the trailing id
  // on recent rows keeps each cmdk `value` unique (so selection never
  // highlights a track and its recent twin together) without polluting search.
  const renderTrackRow = (track: Track, variant: 'recent' | 'library') => (
    <CommandItem
      key={`${variant}-${track.id}`}
      value={
        variant === 'recent'
          ? `${track.title} ${track.artist} ${track.album} ${track.id}`
          : `${track.title} ${track.artist} ${track.album}`
      }
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
  );

  // Navigation rows are derived from SIDEBAR_NAV_ITEMS (the sidebar's single
  // source of truth) so they can never drift, and reuse each item's own icon.
  const navigationRows = SIDEBAR_NAV_ITEMS.map(item => {
    const Icon = item.Icon;
    const shortcut = NAV_SHORTCUTS.get(item.id);
    return (
      <CommandItem
        key={item.id}
        value={`go to ${t(item.key, { ns: 'sidebar' })}`}
        onSelect={() => onNavigate(item.id)}
        className="flex items-center gap-3"
      >
        <Icon className="w-4 h-4" />
        <span>{t('goTo', { view: t(item.key, { ns: 'sidebar' }) })}</span>
        {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
      </CommandItem>
    );
  });

  const recentRows = recentTracks.map(track => renderTrackRow(track, 'recent'));
  const libraryRows = tracks.map(track => renderTrackRow(track, 'library'));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('placeholder')} />
      <CommandList>
        <CommandEmpty>{t('noResults')}</CommandEmpty>

        {recentTracks.length > 0 && (
          <>
            <CommandGroup heading={t('recentlyPlayed')}>{recentRows}</CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading={t('navigation')}>{navigationRows}</CommandGroup>

        {hasTracks && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('tracks')}>{libraryRows}</CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center justify-end gap-4 border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
        <FooterHint keyLabel={ENTER_KEY} label={t('hintSelect')} />
        <FooterHint keyLabel="Esc" label={t('hintClose')} />
      </div>
    </CommandDialog>
  );
}
