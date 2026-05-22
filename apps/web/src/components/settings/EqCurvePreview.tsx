import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import { useEqResponseCurve } from '@/hooks/useEqResponseCurve';

const VIEW_W = 320;
const VIEW_H = 96;

interface EqCurvePreviewProps {
  gains: number[];
  preampDb: number;
  /** Dims the curve when the EQ is disabled, mirroring the band strip. */
  disabled?: boolean;
}

/**
 * Live frequency-response curve for the equalizer — a hand-rolled SVG line
 * through the 10 band gains (plus preamp) so presets like "Loudness" vs
 * "Acoustic" become visually distinct at a glance, not just different slider
 * heights. Pure SVG, no charting dependency; recomputes on every band/preamp
 * change via useEqResponseCurve.
 */
export function EqCurvePreview({ gains, preampDb, disabled }: EqCurvePreviewProps) {
  const { t } = useTranslation('equalizer');
  const gradientId = useId();
  const { linePath, areaPath, zeroY } = useEqResponseCurve({
    gains,
    preampDb,
    width: VIEW_W,
    height: VIEW_H,
  });

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/30 bg-background/40 transition-opacity',
        disabled && 'opacity-50'
      )}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="block h-24 w-full"
        role="img"
        aria-label={t('curvePreview.ariaLabel')}
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
        {EQ_BANDS.map(freq => (
          <span key={freq}>{freq >= 1000 ? `${freq / 1000}k` : freq}</span>
        ))}
      </div>
    </div>
  );
}
