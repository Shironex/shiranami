import type { WeatherCurrent } from '@shiranami/contracts';

/**
 * Weather fits — the pure deriver behind the companion's accessory.
 *
 * When the opt-in weather integration has data, the resident dresses for the
 * sky outside: a leaf umbrella in the rain, a scarf on cold days, a sweat
 * droplet in the heat, a soft lantern glow at night or in fog. Without
 * weather the calendar takes over with a quiet seasonal accent — sakura in
 * spring, a maple leaf in autumn, snow dusting in winter, nothing in summer.
 *
 * Pure on purpose (weather + date in, outfit out): the caller owns *when* to
 * derive; this module only owns *what* the resident wears. Null means bare —
 * the rigs render exactly as they do today.
 */

/** Accessory the resident wears; keys the `data-outfit` CSS reveal. */
export type CompanionOutfit =
  | 'umbrella'
  | 'scarf'
  | 'sun'
  | 'lantern'
  | 'sakura'
  | 'maple'
  | 'snow';

export const COMPANION_OUTFITS: readonly CompanionOutfit[] = [
  'umbrella',
  'scarf',
  'sun',
  'lantern',
  'sakura',
  'maple',
  'snow',
] as const;

/** Below this °C the resident wraps up in the scarf. */
export const COMPANION_SCARF_BELOW_C = 5;

/** Above this °C the sweat droplet appears. */
export const COMPANION_SWEAT_ABOVE_C = 28;

/**
 * Night bucket for the lantern glow — mirrors the Overview greeting's
 * time-of-day windows (night = 22:00–04:59) so the app tells one story about
 * when the day ends.
 */
export function isCompanionNightHour(hour: number): boolean {
  return hour >= 22 || hour < 5;
}

/**
 * The calendar fallback (northern-hemisphere seasons by month): sakura in
 * Mar–May, maple in Sep–Nov, snow in Dec–Feb, bare in summer.
 */
export function seasonalOutfitFor(date: Date): CompanionOutfit | null {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'sakura';
  if (month >= 8 && month <= 10) return 'maple';
  if (month === 11 || month <= 1) return 'snow';
  return null;
}

/**
 * What the resident wears right now. Live weather wins over the calendar;
 * within live weather, precipitation beats temperature beats light: rain and
 * storms call for the leaf umbrella, snowfall dusts the fur, then the cold
 * scarf / heat droplet thresholds, then the lantern for fog or night. Mild
 * clear daytime weather means bare — the accessory should stay an event, not
 * a uniform.
 */
export function outfitFor(weather: WeatherCurrent | null, date: Date): CompanionOutfit | null {
  if (!weather) return seasonalOutfitFor(date);
  if (weather.condition === 'rain' || weather.condition === 'thunderstorm') return 'umbrella';
  if (weather.condition === 'snow') return 'snow';
  if (weather.tempC < COMPANION_SCARF_BELOW_C) return 'scarf';
  if (weather.tempC > COMPANION_SWEAT_ABOVE_C) return 'sun';
  if (weather.condition === 'fog' || isCompanionNightHour(date.getHours())) return 'lantern';
  return null;
}
