import type { CSSProperties } from 'react';
import { useCurrentHour } from '@/hooks/useCurrentHour';

/** The five keyed lighting stops of the room-light day cycle. */
export type RoomLightStopKey = 'dawn' | 'day' | 'goldenHour' | 'dusk' | 'night';

export interface IRoomLightGrade {
  /** Full-strength wash color of the grade (any CSS color; `warmth` scales it in). */
  readonly tint: string;
  /** Strength of the tint wash, 0–1 — the fraction of `tint` mixed over the scene. */
  readonly warmth: number;
  /** Opacity of the warm desk-lamp corner vignette, 0–1 (only lit after dark). */
  readonly lampVignette: number;
}

interface IRoomLightStop {
  /** First local hour (0–23) at which this stop takes over. */
  readonly fromHour: number;
  /** Stable stop identity — for tests and per-stop Storybook stories. */
  readonly key: RoomLightStopKey;
  /** The grade this stop applies until the next stop's hour. */
  readonly grade: IRoomLightGrade;
}

/**
 * The day cycle, keyed by local hour: cool blue-grey at dawn, a barely-there
 * neutral by day, a golden-hour amber wash toward sunset, a warming dusk where
 * the desk lamp starts to glow, and a slightly dimmer night scene lit by the
 * lamp corner alone. Night wraps midnight — hours before the first stop belong
 * to the last one. Alphas stay whisper-quiet on purpose: this is a lighting
 * grade over the ambient art, never a curtain in front of it.
 */
export const ROOM_LIGHT_STOPS: readonly IRoomLightStop[] = [
  {
    fromHour: 5,
    key: 'dawn',
    grade: { tint: 'oklch(0.78 0.05 240)', warmth: 0.08, lampVignette: 0 },
  },
  {
    fromHour: 9,
    key: 'day',
    grade: { tint: 'oklch(0.85 0.02 90)', warmth: 0.03, lampVignette: 0 },
  },
  {
    fromHour: 17,
    key: 'goldenHour',
    grade: { tint: 'oklch(0.75 0.14 65)', warmth: 0.1, lampVignette: 0 },
  },
  {
    fromHour: 20,
    key: 'dusk',
    grade: { tint: 'oklch(0.6 0.1 50)', warmth: 0.07, lampVignette: 0.45 },
  },
  {
    fromHour: 22,
    key: 'night',
    grade: { tint: 'oklch(0.2 0.03 290)', warmth: 0.22, lampVignette: 1 },
  },
];

/**
 * The stop key for a local hour. Fractional hours floor to their containing
 * hour and out-of-range values wrap modulo 24, so a clock source can never
 * select nothing; hours before the first stop (small hours) wrap to the last
 * (night). Exposed on its own because the background scheduler keys off the
 * *stop*, not the grade — both features read the same clock the same way.
 */
export function roomLightStopKeyForHour(hour: number): RoomLightStopKey {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  let active = ROOM_LIGHT_STOPS[ROOM_LIGHT_STOPS.length - 1];
  for (const stop of ROOM_LIGHT_STOPS) {
    if (stop.fromHour <= normalized) active = stop;
  }
  return active.key;
}

/** The grade for a local hour — see {@link roomLightStopKeyForHour}. */
export function roomLightForHour(hour: number): IRoomLightGrade {
  return gradeForStopKey(roomLightStopKeyForHour(hour));
}

/** The grade a stop key names. */
export function gradeForStopKey(key: RoomLightStopKey): IRoomLightGrade {
  // The keys are a closed union, so the find can only miss if the stop table
  // and the union drift — which the fallback turns into "night", never a crash.
  return (
    ROOM_LIGHT_STOPS.find(stop => stop.key === key) ?? ROOM_LIGHT_STOPS[ROOM_LIGHT_STOPS.length - 1]
  ).grade;
}

/** User adjustments layered over a grade — see {@link roomLightLayerStyle}. */
export interface IRoomLightAdjustments {
  /** Grade strength in percent, 0–150; 100 is the authored look. */
  readonly intensity: number;
  /** Warmth hue nudge in degrees, applied to the tint and the lamp pool. */
  readonly hueShift: number;
}

/** The authored look: full strength, no hue nudge. */
const NEUTRAL_ADJUSTMENTS: IRoomLightAdjustments = { intensity: 100, hueShift: 0 };

/**
 * Rotate the hue of one of our `oklch(L C H)` tint constants by `degrees`.
 *
 * A string transform rather than CSS relative-color syntax on purpose: the
 * tints are our own constants in a known format, so parsing them here keeps
 * the output a plain color every engine paints, and keeps the math testable.
 * Anything that does not match the expected form passes through unchanged.
 */
export function shiftOklchHue(color: string, degrees: number): string {
  if (degrees === 0) return color;
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(color);
  if (!match) return color;
  const hue = (((Number(match[3]) + degrees) % 360) + 360) % 360;
  return `oklch(${match[1]} ${match[2]} ${hue})`;
}

/**
 * The `--room-light-*` custom properties the `.room-light` layer consumes
 * (globals.css): the tint pre-mixed to its warmth over transparent, the lamp
 * vignette's opacity, and the hue nudge the lamp gradient adds to its own
 * stops. Kept a pure builder so AmbientBackground's hook, the settings
 * preview and the per-stop Storybook stories derive pixel-identical layers.
 *
 * `adjustments` scales warmth and lamp by `intensity` (clamped so 150% can
 * never push either past fully opaque) and rotates the warmth hue by
 * `hueShift`; omitting it keeps the authored grade byte-identical.
 */
export function roomLightLayerStyle(
  grade: IRoomLightGrade,
  adjustments: IRoomLightAdjustments = NEUTRAL_ADJUSTMENTS
): CSSProperties {
  const scale = Math.max(0, adjustments.intensity) / 100;
  const warmth = Math.min(1, grade.warmth * scale);
  const lamp = Math.min(1, grade.lampVignette * scale);
  return {
    '--room-light-tint': `color-mix(in oklab, ${shiftOklchHue(grade.tint, adjustments.hueShift)} ${Math.round(warmth * 100)}%, transparent)`,
    '--room-light-lamp': String(lamp),
    '--room-light-lamp-hue': String(adjustments.hueShift),
  } as CSSProperties;
}

/**
 * The room-light grade for the current local hour, live across hour
 * boundaries — or, when `stop` names a key, that stop held indefinitely.
 * The clock keeps ticking either way so flipping back to `'auto'` lands on
 * the right hour immediately.
 */
export function useRoomLight(stop: RoomLightStopKey | 'auto' = 'auto'): IRoomLightGrade {
  const hour = useCurrentHour();
  return stop === 'auto' ? roomLightForHour(hour) : gradeForStopKey(stop);
}
