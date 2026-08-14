import { Clock3 } from 'lucide-react';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useResumePreview } from './ResumePreview.hooks';
import type { IResumePreviewProps } from './ResumePreview.types';

export default function ResumePreview(props: IResumePreviewProps) {
  const { title, trackLabel, positionLabel, progressWidth, caption } = useResumePreview(props);

  return (
    <SettingsPreview title={title}>
      <PreviewFrame label={title} canvasClassName="flex items-center gap-3 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Clock3 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className="truncate text-xs font-medium text-foreground">{trackLabel}</p>
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {positionLabel}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/35">
            <div
              className="h-full rounded-full bg-primary/55 transition-[width]"
              style={{ width: progressWidth }}
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{caption}</p>
        </div>
      </PreviewFrame>
    </SettingsPreview>
  );
}
