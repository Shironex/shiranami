import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/lib/formatBytes';
import { computeDiskSegments } from '@/lib/diskSegments';
import type { IDiskUsageBarProps, IDiskUsageBarView } from './DiskUsageBar.types';

/**
 * Derives the three bar segments (music · other-used · free) defensively —
 * clamped, non-negative, always summing to total — so reserved blocks or
 * logical-vs-allocated skew (APFS/NTFS compression, sparse files) can't produce
 * a negative or overflowing slice. `free` uses `bavail`-derived `freeBytes`,
 * never `usedBytes - musicBytes`. See docs/research/2026-06-06-disk-space-usage.md §3.
 */
export function useDiskUsageBar({ volume }: IDiskUsageBarProps): IDiskUsageBarView {
  const { t } = useTranslation('settings');
  const { musicBytes, totalBytes, freeBytes } = volume;

  const { music, other, free } = computeDiskSegments(musicBytes, totalBytes, freeBytes);
  const pct = (n: number): number => (totalBytes > 0 ? (n / totalBytes) * 100 : 0);

  return {
    ariaLabel: t('diskUsage.barAria', {
      music: formatBytes(music),
      other: formatBytes(other),
      free: formatBytes(free),
      total: formatBytes(totalBytes),
    }),
    usedOfTotalLabel: t('diskUsage.ofTotal', {
      used: formatBytes(totalBytes - free),
      total: formatBytes(totalBytes),
    }),
    musicWidth: `${pct(music)}%`,
    otherWidth: `${pct(other)}%`,
    legendItems: [
      {
        swatchClassName: 'bg-primary',
        label: t('diskUsage.musicLabel'),
        value: formatBytes(music),
      },
      {
        swatchClassName: 'bg-muted-foreground/40',
        label: t('diskUsage.otherLabel'),
        value: formatBytes(other),
      },
      {
        swatchClassName: 'bg-muted border border-border/40',
        label: t('diskUsage.freeLabel'),
        value: formatBytes(free),
      },
    ],
  };
}
