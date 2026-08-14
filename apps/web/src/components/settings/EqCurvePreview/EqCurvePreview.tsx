import { cn } from '@/lib/utils';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { useEqCurvePreview, EQ_CURVE_VIEWBOX } from './EqCurvePreview.hooks';
import type { IEqCurvePreviewProps } from './EqCurvePreview.types';

const { width: VIEW_W, height: VIEW_H } = EQ_CURVE_VIEWBOX;

/**
 * Live frequency-response curve for the equalizer — a hand-rolled SVG line
 * through the 10 band gains (plus preamp) so presets like "Loudness" vs
 * "Acoustic" become visually distinct at a glance, not just different slider
 * heights. Pure SVG, no charting dependency; recomputes on every band/preamp
 * change via useEqResponseCurve.
 */
export default function EqCurvePreview(props: IEqCurvePreviewProps) {
  const { ariaLabel, gradientId, linePath, areaPath, zeroY, disabled, ticks } =
    useEqCurvePreview(props);

  const tickLabels = ticks.map(tick => <span key={tick.freq}>{tick.label}</span>);

  return (
    <PreviewFrame
      size="none"
      className={cn('relative overflow-hidden p-0 transition-opacity', disabled && 'opacity-50')}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="block h-24 w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--primary-rgb))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--primary-rgb))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 0 dB baseline */}
        <line
          x1="0"
          y1={zeroY}
          x2={VIEW_W}
          y2={zeroY}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 4"
          className="text-foreground/15"
        />

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="rgb(var(--primary-rgb))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Frequency axis ticks — bass → treble, matching the band strip order. */}
      <div className="flex justify-between px-2 pb-1.5 text-[9px] tabular-nums text-muted-foreground/60">
        {tickLabels}
      </div>
    </PreviewFrame>
  );
}
