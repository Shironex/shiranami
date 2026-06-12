import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useLyricsAppearanceStore,
  LYR_SIZE_CLASS,
  nextLyricsFontSize,
} from '@/stores/useLyricsAppearanceStore';
import { useLyricsView } from '@/hooks/useLyricsView';
import { LyricsBody } from '@/components/lyrics/LyricsBody';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { cn } from '@/lib/utils';

// Common per-line affordances. Size + opacity come from user prefs and are
// composed below via LYR_SIZE_CLASS + CSS custom properties.
const PANEL_BASE_AFFORDANCES =
  'block w-full text-left leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';

// Idle / past lines read their opacity from CSS vars set on the surrounding
// container, so the values can change at runtime without re-tagging classes.
// `hover:opacity-100` restores full contrast on pointer-over (the original
// behavior used a hardcoded `hover:text-muted-foreground/70`).
const PANEL_IDLE = 'text-foreground opacity-[var(--lyrics-idle-opacity)] hover:opacity-100';
const PANEL_PAST = 'text-foreground opacity-[var(--lyrics-past-opacity)]';
const PANEL_ACTIVE_AFFORDANCES = 'text-foreground font-semibold';

interface LyricsPanelProps {
  /** Optional control rendered at the right edge of the panel header. */
  headerAction?: ReactNode;
}

export function LyricsPanel({ headerAction }: LyricsPanelProps) {
  const { t } = useTranslation('lyrics');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);

  const { synced, plain, activeLine, isLoading, handleLineClick } = useLyricsView();

  if (!currentTrack) return null;

  const baseSizeClass = LYR_SIZE_CLASS[lyricsSyncedFontSize];
  const activeSizeClass = LYR_SIZE_CLASS[nextLyricsFontSize(lyricsSyncedFontSize)];

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {t('title')}
        </h2>
        {headerAction}
      </div>
      <LyricsBody
        synced={synced}
        plain={plain}
        activeLine={activeLine}
        isLoading={isLoading}
        onLineClick={handleLineClick}
        loadingLabel={t('finding')}
        emptyLabel={t('notFound')}
        syncedDimOpacity={lyricsSyncedDimOpacity}
        plainOpacity={lyricsPlainOpacity}
        syncedContainerClassName="px-5 py-6"
        syncedSpacingClassName="space-y-4"
        syncedBottomSpacerClassName="h-[50vh]"
        syncedBaseClassName={cn(PANEL_BASE_AFFORDANCES, baseSizeClass)}
        syncedActiveClassName={cn(PANEL_ACTIVE_AFFORDANCES, activeSizeClass)}
        syncedPastClassName={PANEL_PAST}
        syncedIdleClassName={PANEL_IDLE}
        plainContainerClassName="px-5 py-6"
        plainTextClassName={cn(
          'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em]',
          LYR_SIZE_CLASS[lyricsPlainFontSize]
        )}
      />
    </div>
  );
}

export default LyricsPanel;
