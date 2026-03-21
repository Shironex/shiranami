import { cn } from '@/lib/utils';
import type { ListeningActivityPoint } from '@/types/electron';
import { HistoryEmptyState } from './HistoryEmptyState';
import { formatActivityLabel, getRangeCopy, type HistoryRange } from './historyUtils';

type HistoryActivityGraphProps = {
  points: ListeningActivityPoint[];
  range: HistoryRange;
};

export function HistoryActivityGraph({ points, range }: HistoryActivityGraphProps) {
  if (points.length === 0) {
    return (
      <HistoryEmptyState
        title="No activity yet"
        copy={`Nothing has been logged for ${getRangeCopy(range).toLowerCase()}. Play through a few tracks and activity will appear here.`}
      />
    );
  }

  const maxPlayCount = Math.max(...points.map((point) => point.playCount), 1);
  const labelEvery =
    points.length <= 10 ? 1 : points.length <= 20 ? 2 : points.length <= 40 ? 4 : 7;
  const barWidthClass =
    points.length <= 10 ? 'w-10' : points.length <= 31 ? 'w-7' : points.length <= 90 ? 'w-5' : 'w-4';

  return (
    <div className="overflow-x-auto scrollbar-thin pb-1">
      <div className="flex min-w-max items-end gap-2">
        {points.map((point, index) => {
          const height = Math.max(10, Math.round((point.playCount / maxPlayCount) * 112));
          const showLabel = index % labelEvery === 0 || index === points.length - 1;
          return (
            <div key={point.date} className={cn('flex flex-col items-center gap-2', barWidthClass)}>
              <div className="flex h-32 items-end">
                <div
                  className={cn(
                    'w-full rounded-full border border-primary/30 bg-primary/70 transition-colors',
                    point.playCount === 0 && 'border-border/20 bg-foreground/8',
                  )}
                  style={{ height }}
                  title={`${formatActivityLabel(point.date)}: ${point.playCount} plays, ${Math.round(point.listenedMinutes)}m listened`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground/55">
                {showLabel ? formatActivityLabel(point.date) : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
