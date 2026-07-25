import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useLowPerformancePreview } from './LowPerformancePreview.hooks';
import type { ILowPerformancePreviewProps } from './LowPerformancePreview.types';

export default function LowPerformancePreview(props: ILowPerformancePreviewProps) {
  const { title, enabled, statusLabel, badgeLabel, barHeights } = useLowPerformancePreview(props);

  const bars = barHeights.map((height, index) => (
    <div key={`${height}-${index}`} className="rounded-t bg-primary/45" style={{ height }} />
  ));

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        <div className="mx-auto max-w-[340px] rounded-xl border border-border/25 bg-surface/60 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Zap className={cn('size-3.5', enabled ? 'text-amber-300' : 'text-primary')} />
              <span>{statusLabel}</span>
            </div>
            <div
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px]',
                enabled ? 'bg-amber-500/15 text-amber-200' : 'bg-primary/15 text-primary'
              )}
            >
              {badgeLabel}
            </div>
          </div>
          <div
            className={cn(
              'grid grid-cols-8 items-end gap-1 transition-opacity',
              enabled && 'opacity-35'
            )}
          >
            {bars}
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
