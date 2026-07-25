import { Sparkles } from 'lucide-react';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useNoiseOverlayPreview } from './NoiseOverlayPreview.hooks';
import type { INoiseOverlayPreviewProps } from './NoiseOverlayPreview.types';

export default function NoiseOverlayPreview(props: INoiseOverlayPreviewProps) {
  const { title, showNoiseLayer, statusLabel } = useNoiseOverlayPreview(props);

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        <div className="relative mx-auto h-[120px] max-w-[340px] overflow-hidden rounded-xl border border-border/25 bg-surface/60 p-3">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 18% 25%, rgba(var(--primary-rgb), 0.26), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.06), transparent)',
            }}
          />
          {showNoiseLayer && (
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(255,255,255,0.45) 0.7px, transparent 0.8px)',
                backgroundSize: '7px 7px',
              }}
            />
          )}
          <div className="relative flex h-full flex-col justify-end gap-2">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>{statusLabel}</span>
            </div>
            <div className="h-2 w-28 rounded-full bg-foreground/25" />
            <div className="h-1.5 w-20 rounded-full bg-muted-foreground/25" />
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
