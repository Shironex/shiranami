import { Music2, RadioTower } from 'lucide-react';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useCrossfadePreview } from './CrossfadePreview.hooks';
import type { ICrossfadePreviewProps } from './CrossfadePreview.types';

export default function CrossfadePreview(props: ICrossfadePreviewProps) {
  const {
    title,
    outgoingLabel,
    incomingLabel,
    incomingLeft,
    incomingWidth,
    showBlendGlow,
    statusLabel,
    durationLabel,
  } = useCrossfadePreview(props);

  return (
    <SettingsPreview title={title}>
      <div className="rounded-xl border border-border/30 bg-background/40 p-3">
        <div className="relative overflow-hidden rounded-lg border border-border/25 bg-surface/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Music2 className="size-3.5 text-primary" />
              <span className="truncate">{outgoingLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RadioTower className="size-3.5" />
              <span className="truncate">{incomingLabel}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted/30">
              <div className="h-full w-[68%] rounded-full bg-primary/45" />
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted/25">
              <div
                className="absolute inset-y-0 rounded-full bg-sky-400/45"
                style={{
                  left: incomingLeft,
                  width: incomingWidth,
                }}
              />
              {showBlendGlow && (
                <div className="absolute inset-y-0 left-[48%] w-[24%] rounded-full bg-foreground/20 blur-sm" />
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{statusLabel}</span>
            <span className="tabular-nums">{durationLabel}</span>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
