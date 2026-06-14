import { cn } from '@/lib/utils';
import { HistoryEmptyState } from '@/components/history/HistoryEmptyState';
import { useHistoryActivityGraph } from './HistoryActivityGraph.hooks';
import type { IHistoryActivityGraphProps } from './HistoryActivityGraph.types';

export default function HistoryActivityGraph(props: IHistoryActivityGraphProps) {
  const { isEmpty, emptyTitle, emptyCopy, graphAriaLabel, barWidthClass, bars } =
    useHistoryActivityGraph(props);

  if (isEmpty) {
    return <HistoryEmptyState title={emptyTitle} copy={emptyCopy} />;
  }

  const barNodes = bars.map(bar => (
    <div key={bar.date} className={cn('flex flex-col items-center gap-2', barWidthClass)}>
      <div className="flex h-32 items-end">
        <div
          className={cn(
            'w-full rounded-full border border-primary/30 bg-primary/70 transition-colors',
            bar.isEmpty && 'border-border/20 bg-foreground/8'
          )}
          style={{ height: bar.height }}
          title={bar.title}
        />
      </div>
      <span className="text-[10px] text-muted-foreground/55">{bar.label}</span>
    </div>
  ));

  return (
    <div className="overflow-x-auto scrollbar-thin pb-1" role="img" aria-label={graphAriaLabel}>
      <div className="flex min-w-max items-end gap-2">{barNodes}</div>
    </div>
  );
}
