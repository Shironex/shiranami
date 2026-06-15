import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useUiScalePreview } from './UiScalePreview.hooks';
import type { IUiScalePreviewProps, IUiScaleSampleTileProps } from './UiScalePreview.types';

/**
 * One sample card rendered at a fixed pixel base × `factor`. Inline px sizing
 * is deliberate: the real scale setting works through the root font-size, so
 * rem-based classes inside the settings page already follow it — a px-based
 * mock is the only stable reference point for a side-by-side comparison.
 */
function SampleTile({ label, factor, title, subtitle, active }: IUiScaleSampleTileProps) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          'rounded-lg border bg-surface/60 p-3',
          active ? 'border-primary/35' : 'border-border/25'
        )}
      >
        <p
          className="truncate font-medium text-foreground"
          style={{ fontSize: `${13 * factor}px`, lineHeight: 1.4 }}
        >
          {title}
        </p>
        <p
          className="truncate text-muted-foreground"
          style={{ fontSize: `${11 * factor}px`, lineHeight: 1.4 }}
        >
          {subtitle}
        </p>
        <div
          className="grid place-items-center bg-primary/15 ring-1 ring-primary/35"
          style={{
            height: `${22 * factor}px`,
            width: `${64 * factor}px`,
            borderRadius: `${7 * factor}px`,
            marginTop: `${8 * factor}px`,
          }}
        >
          <div
            className="rounded-full bg-primary/70"
            style={{ height: `${5 * factor}px`, width: `${32 * factor}px` }}
          />
        </div>
      </div>
      <p
        className={cn(
          'mt-1.5 text-center text-[10px] tabular-nums',
          active ? 'text-primary/80' : 'text-muted-foreground/60'
        )}
      >
        {label}
      </p>
    </div>
  );
}

/** Side-by-side default-vs-chosen sample so the slider's effect stays legible. */
export default function UiScalePreview({ scale }: IUiScalePreviewProps) {
  const { title, sampleTitle, sampleSubtitle, baseLabel, currentLabel, currentFactor } =
    useUiScalePreview({ scale });

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        <div className="mx-auto flex max-w-[340px] items-start gap-3">
          <SampleTile label={baseLabel} factor={1} title={sampleTitle} subtitle={sampleSubtitle} />
          <SampleTile
            label={currentLabel}
            factor={currentFactor}
            title={sampleTitle}
            subtitle={sampleSubtitle}
            active
          />
        </div>
      </div>
    </SettingsPreview>
  );
}
