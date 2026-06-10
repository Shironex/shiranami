import { useMemo } from 'react';
import { clamp } from '@shiranami/shared';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import { EQ_MIN_DB, EQ_MAX_DB } from '@/stores/useEqStore';

interface EqResponseCurveOptions {
  /** Per-band gains in dB, ordered to match EQ_BANDS. */
  gains: number[];
  /** Overall preamp in dB, shifts the whole curve vertically. */
  preampDb: number;
  /** SVG viewBox width in user units. */
  width: number;
  /** SVG viewBox height in user units. */
  height: number;
  /** Vertical inset so the curve never touches the top/bottom edges. */
  padY?: number;
}

export interface EqResponseCurve {
  /** SVG `d` for the response line. */
  linePath: string;
  /** SVG `d` for the filled area between the line and the 0 dB baseline. */
  areaPath: string;
  /** y coordinate of the 0 dB line, for the baseline guide. */
  zeroY: number;
  /** Mapped band points, for optional dot markers. */
  points: Array<{ x: number; y: number; gain: number }>;
}

// EQ_BANDS spans 31..16000 Hz; map on a log axis so the spacing matches the
// perceptual / slider layout rather than crowding everything into the bass.
const MIN_LOG = Math.log10(EQ_BANDS[0]);
const MAX_LOG = Math.log10(EQ_BANDS[EQ_BANDS.length - 1]);
const LOG_SPAN = MAX_LOG - MIN_LOG;

// dB range the y-axis covers. A band can reach EQ_MAX_DB and preamp adds up to
// the same magnitude, so the curve can exceed the band range; clamp to this
// padded display window so preamp headroom remains visible without overshooting.
const PREAMP_HEADROOM_DB = Math.max(Math.abs(EQ_MIN_DB), Math.abs(EQ_MAX_DB));
const DISPLAY_MIN_DB = EQ_MIN_DB - PREAMP_HEADROOM_DB;
const DISPLAY_MAX_DB = EQ_MAX_DB + PREAMP_HEADROOM_DB;
const DB_RANGE = DISPLAY_MAX_DB - DISPLAY_MIN_DB;

/**
 * Builds a smooth frequency-response curve (Catmull-Rom spline) from the EQ band
 * gains + preamp, ready to drop into an SVG. Pure geometry — no audio graph, no
 * dependencies — so it stays in lockstep with the band data model and is cheap
 * to recompute on every slider tick.
 */
export function useEqResponseCurve({
  gains,
  preampDb,
  width,
  height,
  padY = 8,
}: EqResponseCurveOptions): EqResponseCurve {
  return useMemo(() => {
    const usableH = height - padY * 2;
    const dbToY = (db: number) => {
      // 0 dB sits at the vertical centre; +db rises (smaller y).
      const norm = clamp((db - DISPLAY_MIN_DB) / DB_RANGE, 0, 1);
      return padY + (1 - norm) * usableH;
    };
    const freqToX = (freq: number) => ((Math.log10(freq) - MIN_LOG) / LOG_SPAN) * width;

    const points = EQ_BANDS.map((freq, i) => {
      const gain = clamp((gains[i] ?? 0) + preampDb, DISPLAY_MIN_DB, DISPLAY_MAX_DB);
      return { x: freqToX(freq), y: dbToY(gain), gain };
    });

    const zeroY = dbToY(0);
    const linePath = catmullRomPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

    return { linePath, areaPath, zeroY, points };
  }, [gains, preampDb, width, height, padY]);
}

// Catmull-Rom → cubic Bézier so the line reads as a smooth response curve rather
// than connected straight segments, while still passing exactly through each
// band point (matching the slider positions).
function catmullRomPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
