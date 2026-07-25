import { Moon } from 'lucide-react';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useSleepFadePreview } from './SleepFadePreview.hooks';
import type { ISleepFadePreviewProps } from './SleepFadePreview.types';

export default function SleepFadePreview(props: ISleepFadePreviewProps) {
  const { title, barHeights, caption } = useSleepFadePreview(props);

  const bars = barHeights.map((height, i) => (
    <div
      key={i}
      className="w-full rounded-full bg-primary/45 transition-[height] duration-300"
      style={{ height }}
    />
  ));

  return (
    <SettingsPreview title={title}>
      <div className="rounded-xl border border-border/30 bg-background/40 p-3">
        <div className="relative h-16 rounded-lg border border-border/25 bg-surface/60 px-3 pt-2 pb-2">
          <Moon className="absolute right-2 top-2 size-3.5 text-primary/60" aria-hidden="true" />
          <div className="flex h-full items-end gap-1">{bars}</div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{caption}</p>
      </div>
    </SettingsPreview>
  );
}
