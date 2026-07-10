import { useTranslation } from 'react-i18next';
import {
  useLyricsAppearanceStore,
  LYR_SIZE_CLASS,
  nextLyricsFontSize,
} from '@/stores/useLyricsAppearanceStore';
import { useLyricsView } from '@/hooks/useLyricsView';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { cn } from '@/lib/utils';
import type { LyricsSource } from '@/hooks/queries/useLyrics';
import type { ILyricsPanelView, TranslateFn } from './LyricsPanel.types';

// Common per-line affordances. Size + opacity come from user prefs and are
// composed below via LYR_SIZE_CLASS + CSS custom properties.
const PANEL_BASE_AFFORDANCES =
  'block w-full text-left leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';

// Idle / past lines read their opacity from CSS vars set on the surrounding
// container, so the values can change at runtime without re-tagging classes.
// `hover:opacity-100` restores full contrast on pointer-over.
const PANEL_IDLE = 'text-foreground opacity-[var(--lyrics-idle-opacity)] hover:opacity-100';
const PANEL_PAST = 'text-foreground opacity-[var(--lyrics-past-opacity)]';
const PANEL_ACTIVE_AFFORDANCES = 'text-foreground font-semibold';

/** Human label for where the lyrics came from, or null when unresolved. */
function sourceToLabel(source: LyricsSource, t: TranslateFn): string | null {
  switch (source) {
    case 'local-lrc':
    case 'local-txt':
      return t('sourceLocal');
    case 'embedded':
      return t('sourceEmbedded');
    case 'lrclib':
      return t('sourceLrclib');
    default:
      return null;
  }
}

export function useLyricsPanel(): ILyricsPanelView {
  const { t } = useTranslation('lyrics');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);

  const { synced, plain, source, activeLine, isLoading, handleLineClick } = useLyricsView();

  const baseSizeClass = LYR_SIZE_CLASS[lyricsSyncedFontSize];
  const activeSizeClass = LYR_SIZE_CLASS[nextLyricsFontSize(lyricsSyncedFontSize)];

  return {
    t,
    hasTrack: currentTrack !== null,
    synced,
    plain,
    activeLine,
    isLoading,
    sourceLabel: sourceToLabel(source, t),
    onLineClick: handleLineClick,
    syncedDimOpacity: lyricsSyncedDimOpacity,
    plainOpacity: lyricsPlainOpacity,
    syncedBaseClassName: cn(PANEL_BASE_AFFORDANCES, baseSizeClass),
    syncedActiveClassName: cn(PANEL_ACTIVE_AFFORDANCES, activeSizeClass),
    syncedPastClassName: PANEL_PAST,
    syncedIdleClassName: PANEL_IDLE,
    plainTextClassName: cn(
      'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em]',
      LYR_SIZE_CLASS[lyricsPlainFontSize]
    ),
  };
}
