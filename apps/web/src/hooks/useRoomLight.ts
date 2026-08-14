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
 * The grade for a local hour. Fractional hours floor to their containing hour
 * and out-of-range values wrap modulo 24, so a clock source can never select
 * nothing; hours before the first stop (small hours) wrap to the last (night).
 */
export function roomLightForHour(hour: number): IRoomLightGrade {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  let active = ROOM_LIGHT_STOPS[ROOM_LIGHT_STOPS.length - 1];
  for (const stop of ROOM_LIGHT_STOPS) {
    if (stop.fromHour <= normalized) active = stop;
  }
  return active.grade;
}

/**
 * The `--room-light-*` custom properties the `.room-light` layer consumes
 * (globals.css): the tint pre-mixed to its warmth over transparent, and the
 * lamp vignette's opacity. Kept a pure builder so AmbientBackground's hook and
 * the per-stop Storybook stories derive pixel-identical layers.
 */
export function roomLightLayerStyle(grade: IRoomLightGrade): CSSProperties {
  return {
    '--room-light-tint': `color-mix(in oklab, ${grade.tint} ${Math.round(grade.warmth * 100)}%, transparent)`,
    '--room-light-lamp': String(grade.lampVignette),
  } as CSSProperties;
}

/** The room-light grade for the current local hour, live across hour boundaries. */
export function useRoomLight(): IRoomLightGrade {
  const hour = useCurrentHour();
  return roomLightForHour(hour);
}
