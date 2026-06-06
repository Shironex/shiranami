import { useTranslation } from 'react-i18next';
import type { VolumeUsage } from '@shiranami/contracts';
import { formatBytes } from '@/lib/formatBytes';
import { computeDiskSegments } from '@/lib/diskSegments';
import { cn } from '@/lib/utils';

interface DiskUsageBarProps {
  volume: VolumeUsage;
}

interface LegendItemProps {
  swatchClassName: string;
  label: string;
  value: string;
}

function LegendItem({ swatchClassName, label, value }: LegendItemProps) {
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
 *
 * The three segments are derived defensively here (clamped, non-negative, always
 * summing to total) so reserved blocks or logical-vs-allocated skew (APFS/NTFS
 * compression, sparse files) can't produce a negative or overflowing slice —
 * `free` uses `bavail`-derived `freeBytes`, never `usedBytes - musicBytes`. See
 * docs/research/2026-06-06-disk-space-usage.md §3.
 */
export function DiskUsageBar({ volume }: DiskUsageBarProps) {
  const { t } = useTranslation('settings');
  const { musicBytes, totalBytes, freeBytes } = volume;

  const { music, other, free } = computeDiskSegments(musicBytes, totalBytes, freeBytes);
  const pct = (n: number) => (totalBytes > 0 ? (n / totalBytes) * 100 : 0);

  const ariaLabel = t('diskUsage.barAria', {
    music: formatBytes(music),
    other: formatBytes(other),
    free: formatBytes(free),
    total: formatBytes(totalBytes),
  });

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        {t('diskUsage.ofTotal', {
          used: formatBytes(totalBytes - free),
          total: formatBytes(totalBytes),
        })}
      </p>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex w-full h-2.5 rounded-full overflow-hidden bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${pct(music)}%` }} aria-hidden="true" />
        <div
          className="h-full bg-muted-foreground/40"
          style={{ width: `${pct(other)}%` }}
          aria-hidden="true"
        />
        {/* The remaining track background represents free space. */}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <LegendItem
          swatchClassName="bg-primary"
          label={t('diskUsage.musicLabel')}
          value={formatBytes(music)}
        />
        <LegendItem
          swatchClassName="bg-muted-foreground/40"
          label={t('diskUsage.otherLabel')}
          value={formatBytes(other)}
        />
        <LegendItem
          swatchClassName="bg-muted border border-border/40"
          label={t('diskUsage.freeLabel')}
          value={formatBytes(free)}
        />
      </div>
    </div>
  );
}
