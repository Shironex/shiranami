import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { LyricsBody } from '../LyricsBody';
import { useLyricsPanel } from './LyricsPanel.hooks';
import type { ILyricsPanelProps } from './LyricsPanel.types';

export default function LyricsPanel({ headerAction }: ILyricsPanelProps) {
  const {
    t,
    hasTrack,
    synced,
    plain,
    activeLine,
    isLoading,
    isError,
    sourceLabel,
    retryLabel,
    onLineClick,
    onRetry,
    syncedDimOpacity,
    plainOpacity,
    syncedBaseClassName,
    syncedActiveClassName,
    syncedPastClassName,
    syncedIdleClassName,
    plainTextClassName,
  } = useLyricsPanel();

  if (!hasTrack) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-2 min-h-[49px] border-b border-border/20 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {t('title')}
          </h2>
          {sourceLabel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border/30 bg-muted/20 text-[9px] font-semibold uppercase tracking-[0.1em] leading-none text-muted-foreground/70">
                  <span className="sr-only">{t('sourceTooltip')}: </span>
                  <span>{sourceLabel}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('sourceTooltip')}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {headerAction}
      </div>
      <LyricsBody
        synced={synced}
        plain={plain}
        activeLine={activeLine}
        isLoading={isLoading}
        isError={isError}
        onLineClick={onLineClick}
        onRetry={onRetry}
        loadingLabel={t('finding')}
        emptyLabel={t('notFound')}
        errorLabel={t('error')}
        retryLabel={retryLabel}
        syncedDimOpacity={syncedDimOpacity}
        plainOpacity={plainOpacity}
        syncedContainerClassName="px-5 py-6"
        syncedSpacingClassName="space-y-4"
        syncedBottomSpacerClassName="h-[50vh]"
        syncedBaseClassName={syncedBaseClassName}
        syncedActiveClassName={syncedActiveClassName}
        syncedPastClassName={syncedPastClassName}
        syncedIdleClassName={syncedIdleClassName}
        plainContainerClassName="px-5 py-6"
        plainTextClassName={plainTextClassName}
      />
    </div>
  );
}
