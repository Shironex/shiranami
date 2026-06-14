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
    onLineClick,
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
        onLineClick={onLineClick}
        loadingLabel={t('finding')}
        emptyLabel={t('notFound')}
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
