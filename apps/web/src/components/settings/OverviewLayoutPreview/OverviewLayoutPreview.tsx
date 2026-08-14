import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { OverviewSectionId } from '@/lib/overview-sections';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useOverviewLayoutPreview } from './OverviewLayoutPreview.hooks';
import type {
  IOverviewBlockProps,
  IOverviewLayoutPreviewProps,
} from './OverviewLayoutPreview.types';

/** Collapsible mock block: fades + folds away when its toggle is off. */
function OverviewBlock({
  visible,
  highlighted,
  expandedClass,
  children,
  className,
}: IOverviewBlockProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg transition-all duration-300',
        visible ? cn(expandedClass, 'opacity-100') : 'max-h-0 opacity-0',
        highlighted && visible && 'ring-1 ring-primary/40 bg-primary/10',
        className
      )}
    >
      {children}
    </div>
  );
}

export default function OverviewLayoutPreview(props: IOverviewLayoutPreviewProps) {
  const {
    title,
    sectionOrder,
    recap,
    memories,
    stats,
    topWeek,
    clock,
    topAlbums,
    mixes,
    recommendations,
    recentlyAdded,
    showRightColumn,
    showWeekGrid,
    statsTiles,
    topWeekRows,
    clockBars,
    albumTiles,
    mixTiles,
    recTiles,
    recentRows,
    recapRows,
    memoryRows,
  } = useOverviewLayoutPreview(props);

  const statsTileEls = statsTiles.map(i => (
    <div key={i} className="h-6 rounded-md border border-border/25 bg-muted/20" />
  ));

  const topWeekRowEls = topWeekRows.map(row => (
    <div key={row.key} className="flex items-center gap-1.5">
      <div className="size-3.5 rounded bg-primary/20" />
      <div className="h-1.5 rounded-full bg-foreground/20" style={{ width: `${row.widthPx}px` }} />
    </div>
  ));

  const clockBarEls = clockBars.map((h, i) => (
    <div key={i} className="w-full rounded-sm bg-primary/35" style={{ height: `${h}%` }} />
  ));

  const albumTileEls = albumTiles.map(i => (
    <div key={i} className="size-6 rounded-md bg-primary/20" />
  ));

  const mixTileEls = mixTiles.map(i => (
    <div
      key={i}
      className="h-8 w-12 rounded-md border border-border/25 bg-gradient-to-br from-primary/20 to-muted/20"
    />
  ));

  const recTileEls = recTiles.map(i => (
    <div key={i} className="size-7 rounded-md border border-border/25 bg-muted/25" />
  ));

  const recentRowEls = recentRows.map(row => (
    <div key={row.key} className="flex items-center gap-1.5">
      <div className="size-4 rounded bg-muted/35" />
      <div
        className="h-1.5 rounded-full bg-muted-foreground/25"
        style={{ width: `${row.widthPx}px` }}
      />
    </div>
  ));

  const recapRowEls = recapRows.map(row => (
    <div
      key={row.key}
      className="h-1.5 rounded-full bg-muted-foreground/25"
      style={{ width: `${row.widthPx}px` }}
    />
  ));

  const memoryRowEls = memoryRows.map(row => (
    <div
      key={row.key}
      className="h-1.5 rounded-full bg-muted-foreground/25"
      style={{ width: `${row.widthPx}px` }}
    />
  ));

  const sectionBlocks: Record<OverviewSectionId, ReactNode> = {
    recap: (
      <OverviewBlock
        key="recap"
        visible={recap.visible}
        highlighted={recap.highlighted}
        expandedClass="max-h-14"
        className="border border-border/25 bg-muted/15"
      >
        <div className="space-y-1.5 p-2">{recapRowEls}</div>
      </OverviewBlock>
    ),

    memories: (
      <OverviewBlock
        key="memories"
        visible={memories.visible}
        highlighted={memories.highlighted}
        expandedClass="max-h-14"
        className="border border-border/25 bg-muted/15"
      >
        <div className="flex items-center gap-1.5 p-2">
          <div className="size-6 shrink-0 rounded-md bg-primary/20" />
          <div className="space-y-1.5">{memoryRowEls}</div>
        </div>
      </OverviewBlock>
    ),

    stats: (
      <OverviewBlock
        key="stats"
        visible={stats.visible}
        highlighted={stats.highlighted}
        expandedClass="max-h-8"
      >
        <div className="grid grid-cols-4 gap-1.5 p-0.5">{statsTileEls}</div>
      </OverviewBlock>
    ),

    // Week grid: top tracks + clock/albums column
    insights: showWeekGrid ? (
      <div key="insights" className="flex gap-1.5">
        <OverviewBlock
          visible={topWeek.visible}
          highlighted={topWeek.highlighted}
          expandedClass="max-h-24"
          className="flex-[1.3] border border-border/25 bg-muted/15"
        >
          <div className="space-y-1.5 p-2">{topWeekRowEls}</div>
        </OverviewBlock>
        {showRightColumn && (
          <div className="flex flex-1 flex-col gap-1.5">
            <OverviewBlock
              visible={clock.visible}
              highlighted={clock.highlighted}
              expandedClass="max-h-11"
              className="border border-border/25 bg-muted/15"
            >
              <div className="flex h-10 items-end justify-between gap-0.5 px-2 pb-1.5 pt-2">
                {clockBarEls}
              </div>
            </OverviewBlock>
            <OverviewBlock
              visible={topAlbums.visible}
              highlighted={topAlbums.highlighted}
              expandedClass="max-h-11"
              className="border border-border/25 bg-muted/15"
            >
              <div className="flex gap-1.5 p-2">{albumTileEls}</div>
            </OverviewBlock>
          </div>
        )}
      </div>
    ) : null,

    mixes: (
      <OverviewBlock
        key="mixes"
        visible={mixes.visible}
        highlighted={mixes.highlighted}
        expandedClass="max-h-10"
      >
        <div className="flex gap-1.5 p-0.5">{mixTileEls}</div>
      </OverviewBlock>
    ),

    recommendations: (
      <OverviewBlock
        key="recommendations"
        visible={recommendations.visible}
        highlighted={recommendations.highlighted}
        expandedClass="max-h-9"
      >
        <div className="flex gap-1.5 p-0.5">{recTileEls}</div>
      </OverviewBlock>
    ),

    recentlyAdded: (
      <OverviewBlock
        key="recentlyAdded"
        visible={recentlyAdded.visible}
        highlighted={recentlyAdded.highlighted}
        expandedClass="max-h-12"
      >
        <div className="space-y-1.5 p-0.5">{recentRowEls}</div>
      </OverviewBlock>
    ),
  };

  const orderedBlocks = sectionOrder.map(id => sectionBlocks[id]);

  return (
    <SettingsPreview title={title}>
      <PreviewFrame label={title} canvasClassName="flex flex-col gap-1.5 p-3">
        {/* Greeting hero — always shown, not toggleable */}
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-primary/15 to-transparent px-2">
          <div className="size-5 rounded-full bg-primary/30" />
          <div className="space-y-1">
            <div className="h-1.5 w-20 rounded-full bg-foreground/25" />
            <div className="h-1 w-14 rounded-full bg-muted-foreground/25" />
          </div>
        </div>

        {orderedBlocks}
      </PreviewFrame>
    </SettingsPreview>
  );
}
