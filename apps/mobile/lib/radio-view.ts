import { countLabel } from '@/lib/format';
import type { RadioStation } from '@/lib/radio';

/** Saved stations shown as one tap presets above the list, like a car radio. */
export const PRESET_COUNT = 4;

export function radioPresets(favorites: RadioStation[]): RadioStation[] {
  return favorites.slice(0, PRESET_COUNT);
}

/** The window subtitle: what is on air, else how many stations are saved. */
export function radioSubtitle(liveName: string | null, savedCount: number): string {
  if (liveName) return `${liveName} is live`;
  if (savedCount === 0) return 'Live stations from everywhere';
  return countLabel(savedCount, 'saved station', 'saved stations');
}

export interface RadioNotice {
  text: string;
  /** What Try again does: play the station again, or reload the list. */
  retry: 'station' | 'list';
}

/**
 * The inline error under the presets. A station that will not play wins over
 * a list that did not load, since the user just asked for it.
 */
export function radioNotice(
  liveName: string | null,
  playerError: string | null,
  listError: string | null
): RadioNotice | null {
  if (liveName && playerError) return { text: `${liveName} did not answer.`, retry: 'station' };
  if (listError) return { text: 'Stations did not load.', retry: 'list' };
  return null;
}
