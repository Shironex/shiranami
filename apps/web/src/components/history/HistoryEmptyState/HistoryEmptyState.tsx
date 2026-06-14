import { useHistoryEmptyState } from './HistoryEmptyState.hooks';
import type { IHistoryEmptyStateProps } from './HistoryEmptyState.types';

export default function HistoryEmptyState(props: IHistoryEmptyStateProps) {
  const { title, copy } = useHistoryEmptyState(props);

  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/25 bg-background/20 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 max-w-sm text-xs text-muted-foreground/65">{copy}</p>
    </div>
  );
}
