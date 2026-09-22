import type { ReactNode } from 'react';
import { AlertCircle, Loader2, Music2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LyricsList } from '../LyricsList';
import { useLyricsBody } from './LyricsBody.hooks';
import type { ILyricsBodyProps } from './LyricsBody.types';

/**
 * The shared 5-branch lyrics render (loading → synced → plain → error → empty)
 * behind NowPlayingView and LyricsPanel, parameterized by each surface's
 * size-class maps, spacing, and container classes. The error branch sits after
 * the content branches so a failed refetch never hides lyrics we already have.
 */
export default function LyricsBody(props: ILyricsBodyProps): ReactNode {
  const { hasSynced, hasPlain, lyricsVars, syncedWrapperClassName } = useLyricsBody(props);
  const {
    synced,
    plain,
    activeLine,
    isLoading,
    isError,
    onLineClick,
    onRetry,
    loadingLabel,
    emptyLabel,
    errorLabel,
    retryLabel,
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

  if (isError) {
    return (
      <div
        className={cn(
          'flex-1 flex flex-col items-center justify-center gap-3',
          stateContainerClassName
        )}
      >
        <div className="w-9 h-9 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-destructive" aria-hidden="true" />
        </div>
        <p className="text-xs font-medium text-muted-foreground">{errorLabel}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="h-7 rounded-xl px-3">
          <RotateCcw className="size-3.5" />
          {retryLabel}
        </Button>
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
