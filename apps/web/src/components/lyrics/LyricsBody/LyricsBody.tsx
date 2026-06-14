import type { ReactNode } from 'react';
import { Loader2, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LyricsList } from '../LyricsList';
import { useLyricsBody } from './LyricsBody.hooks';
import type { ILyricsBodyProps } from './LyricsBody.types';

/**
 * The shared 4-branch lyrics render (loading → synced → plain → empty) behind
 * NowPlayingView and LyricsPanel, parameterized by each surface's size-class
 * maps, spacing, and container classes.
 */
export default function LyricsBody(props: ILyricsBodyProps): ReactNode {
  const { hasSynced, hasPlain, lyricsVars, syncedWrapperClassName } = useLyricsBody(props);
  const {
    synced,
    plain,
    activeLine,
    isLoading,
    onLineClick,
    loadingLabel,
    emptyLabel,
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
    stateContainerClassName,
    emptyClassName,
  } = props;

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

  if (hasSynced && synced) {
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

  if (hasPlain && plain) {
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
