import { useCurrentHour } from '@/hooks/useCurrentHour';
import { ROOM_LIGHT_STOPS, type RoomLightStopKey } from '@/hooks/useRoomLight';
import type { SanctuaryClockFace, SanctuaryVariant } from '@/stores/useSanctuaryStore';

/** The sanctuary's four-phase read of the day. */
export type SanctuaryDayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface ISanctuaryScene {
  /** The center stage the phase asks for. */
  readonly variant: SanctuaryVariant;
  /** Clock treatment for phases whose stage is the clock; null otherwise. */
  readonly clockFace: SanctuaryClockFace | null;
}

/**
 * The room-light stops folded onto the sanctuary's four phases. Golden hour
 * belongs to dusk here: the vinyl comes out with the amber light, not only
 * once the lamp is lit.
 */
const PHASE_BY_STOP: Record<RoomLightStopKey, SanctuaryDayPhase> = {
  dawn: 'dawn',
  day: 'day',
  goldenHour: 'dusk',
  dusk: 'dusk',
  night: 'night',
};

/**
 * What each phase of the day puts center-stage in follow-the-day mode: a quiet
 * serif clock at first light, the cover in full daylight, the record through
 * golden hour and dusk, and thin oversized numerals as a night clock.
 */
export const SANCTUARY_SCENES: Record<SanctuaryDayPhase, ISanctuaryScene> = {
  dawn: { variant: 'clock', clockFace: 'serif' },
  day: { variant: 'cover', clockFace: null },
  dusk: { variant: 'vinyl', clockFace: null },
  night: { variant: 'clock', clockFace: 'oversized' },
};

/**
 * The phase for a local hour, sharing the room-light stop table (read-only)
 * so both features agree on where the day's boundaries fall. Same selection
 * rules as `roomLightForHour`: fractional hours floor, out-of-range values
 * wrap modulo 24, and small hours before the first stop belong to night.
 */
export function sanctuaryPhaseForHour(hour: number): SanctuaryDayPhase {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  let active = ROOM_LIGHT_STOPS[ROOM_LIGHT_STOPS.length - 1];
  for (const stop of ROOM_LIGHT_STOPS) {
    if (stop.fromHour <= normalized) active = stop;
  }
  return PHASE_BY_STOP[active.key];
}

/** The scene for a local hour — `SANCTUARY_SCENES` keyed by its phase. */
export function sanctuarySceneForHour(hour: number): ISanctuaryScene {
  return SANCTUARY_SCENES[sanctuaryPhaseForHour(hour)];
}

/** The follow-the-day scene for the current local hour, live across hours. */
export function useSanctuaryScene(): ISanctuaryScene {
  return sanctuarySceneForHour(useCurrentHour());
}
