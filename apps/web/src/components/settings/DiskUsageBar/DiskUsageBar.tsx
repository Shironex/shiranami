import { cn } from '@/lib/utils';
import { useDiskUsageBar } from './DiskUsageBar.hooks';
import type { IDiskUsageBarProps, IDiskUsageLegendItem } from './DiskUsageBar.types';

function LegendItem({ swatchClassName, label, value }: IDiskUsageLegendItem) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn('inline-block w-2.5 h-2.5 rounded-sm', swatchClassName)}
        aria-hidden="true"
      />
      <span className="text-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

/**
 * Custom segmented progress bar for one volume: music · other-used · free.
 * Segment widths and labels are resolved in `useDiskUsageBar`.
 */
export default function DiskUsageBar({ volume }: IDiskUsageBarProps) {
  const { ariaLabel, usedOfTotalLabel, musicWidth, otherWidth, legendItems } = useDiskUsageBar({
    volume,
  });

  const legend = legendItems.map((item: IDiskUsageLegendItem) => (
    <LegendItem
      key={item.label}
      swatchClassName={item.swatchClassName}
      label={item.label}
      value={item.value}
    />
  ));

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">{usedOfTotalLabel}</p>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex w-full h-2.5 rounded-full overflow-hidden bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: musicWidth }} aria-hidden="true" />
        <div
          className="h-full bg-muted-foreground/40"
          style={{ width: otherWidth }}
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">{legend}</div>
    </div>
  );
}
