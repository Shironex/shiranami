import { useHistoryStatCard } from './HistoryStatCard.hooks';
import type { IHistoryStatCardProps } from './HistoryStatCard.types';

export default function HistoryStatCard(props: IHistoryStatCardProps) {
  const { label, value, hint, Icon } = useHistoryStatCard(props);

  return (
    <div className="rounded-2xl border border-border/25 glass-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/55">
          {label}
        </span>
        <Icon className="size-4 text-primary/80" />
      </div>
      <p className="mt-3 font-display text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground/65">{hint}</p>
    </div>
  );
}
