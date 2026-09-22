import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
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
      <PreviewFrame label={title} canvasClassName="p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-foreground">
            <Zap className={cn('size-3.5', enabled ? 'text-warning' : 'text-primary')} />
            <span>{statusLabel}</span>
          </div>
          <div
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              enabled ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'
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
      </PreviewFrame>
    </SettingsPreview>
  );
}
