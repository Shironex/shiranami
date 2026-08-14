import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useLoudnessPreview } from './LoudnessPreview.hooks';
import type { ILoudnessPreviewProps } from './LoudnessPreview.types';

export default function LoudnessPreview(props: ILoudnessPreviewProps) {
  const { title, targetLabel, targetLineBottom, barHeights, caption } = useLoudnessPreview(props);

  const bars = barHeights.map((height, i) => (
    <div
      key={i}
      className="w-full rounded-full bg-primary/45 transition-[height] duration-300"
      style={{ height }}
    />
  ));

  return (
    <SettingsPreview title={title}>
      {/* overflow-visible: the LUFS tag rides above the target line and may
          poke past the canvas top at the loudest settings. */}
      <PreviewFrame
        label={title}
        caption={caption}
        canvasClassName="h-20 overflow-visible px-3 pt-2 pb-3"
      >
        {/* Target loudness line */}
        <div
          className="pointer-events-none absolute inset-x-3 border-t border-dashed border-primary/50 transition-[bottom] duration-300"
          style={{ bottom: targetLineBottom }}
        >
          <span className="absolute -top-3.5 right-0 text-[9px] tabular-nums text-primary/70">
            {targetLabel}
          </span>
        </div>

        {/* Track level bars */}
        <div className="flex h-full items-end justify-between gap-2">{bars}</div>
      </PreviewFrame>
    </SettingsPreview>
  );
}
