import { type CSSProperties, type ReactNode } from 'react';
import { Loader2, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LyricsList } from '@/components/lyrics/LyricsList';
import { LYRICS_SYNCED_PAST_RATIO } from '@/stores/useLyricsAppearanceStore';
import type { LyricLine } from '@/hooks/queries/useLyrics';

interface LyricsBodyProps {
  synced: LyricLine[] | null;
  plain: string | null;
  activeLine: number;
  isLoading: boolean;
  onLineClick: (time: number) => void;

  /** Label shown in the loading branch. */
  loadingLabel: string;
  /** Label shown in the empty branch. */
  emptyLabel: string;

  /** Dynamic opacity for idle/past synced lines (drives the CSS vars). */
  syncedDimOpacity: number;
  plainOpacity: number;

  // Per-branch class hooks so each surface keeps its own sizing/spacing.
  syncedContainerClassName?: string;
  syncedSpacingClassName?: string;
  syncedBottomSpacerClassName?: string;
  syncedBaseClassName: string;
  syncedActiveClassName: string;
  syncedPastClassName: string;
  syncedIdleClassName: string;
  plainContainerClassName?: string;
  plainTextClassName: string;
  /** Wrapper for the synced LyricsList — `'contents'` (NowPlaying) or a flex box. */
  syncedWrapperClassName?: string;
  /** Optional override for the loading/empty branch container. */
  stateContainerClassName?: string;
  /** Optional className for the empty-state icon + label group. */
  emptyClassName?: string;
}

/**
 * The shared 4-branch lyrics render (loading → synced → plain → empty) behind
 * NowPlayingView and LyricsPanel, parameterized by each surface's size-class
 * maps, spacing, and container classes. Migrating both views onto it is Phase 3.
 */
export function LyricsBody({
  synced,
  plain,
  activeLine,
  isLoading,
  onLineClick,
  loadingLabel,
  emptyLabel,
  syncedDimOpacity,
  plainOpacity,
  syncedContainerClassName,
  syncedSpacingClassName,
  syncedBottomSpacerClassName,
  syncedBaseClassName,
  syncedActiveClassName,
  syncedPastClassName,
  syncedIdleClassName,
  plainContainerClassName,
  plainTextClassName,
  syncedWrapperClassName = 'flex-1 flex flex-col min-h-0',
  stateContainerClassName,
  emptyClassName,
}: LyricsBodyProps): ReactNode {
  if (isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', stateContainerClassName)}>
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span className="text-xs font-medium">{loadingLabel}</span>
        </div>
      </div>
    );
  }

  if (synced && synced.length > 0) {
    const lyricsVars = {
      '--lyrics-idle-opacity': String(syncedDimOpacity),
      '--lyrics-past-opacity': String(syncedDimOpacity * LYRICS_SYNCED_PAST_RATIO),
    } as CSSProperties;

    return (
      <div className={syncedWrapperClassName} style={lyricsVars}>
        <LyricsList
          lines={synced}
          activeIndex={activeLine}
          onLineClick={onLineClick}
          containerClassName={syncedContainerClassName}
          spacingClassName={syncedSpacingClassName}
          bottomSpacerClassName={syncedBottomSpacerClassName}
          baseClassName={syncedBaseClassName}
          activeClassName={syncedActiveClassName}
          pastClassName={syncedPastClassName}
          idleClassName={syncedIdleClassName}
        />
      </div>
    );
  }

  if (plain) {
    return (
      <div className={cn('flex-1 overflow-y-auto scrollbar-hide', plainContainerClassName)}>
        <pre className={plainTextClassName} style={{ opacity: plainOpacity }}>
          {plain}
        </pre>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-3',
        emptyClassName ?? 'text-muted-foreground'
      )}
    >
      <Music2 className="w-7 h-7 text-muted-foreground/20" aria-hidden="true" />
      <p className="text-xs font-medium">{emptyLabel}</p>
    </div>
  );
}
