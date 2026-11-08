import { countLabel } from '@/lib/format';
import type { Track } from '@/stores/usePlayerStore';

/** A song after the playing one, with its slot in the queue so a tap can jump there. */
export interface UpNextEntry {
  track: Track;
  index: number;
}

/** The songs after the playing one, in play order. */
export function upNextEntries(queue: Track[], queueIndex: number): UpNextEntry[] {
  return queue.slice(queueIndex + 1).map((track, i) => ({ track, index: queueIndex + 1 + i }));
}

/** "12 songs, 34 min", or just the count while durations are unknown. */
export function upNextSummary(entries: UpNextEntry[]): string {
  const count = countLabel(entries.length, 'song', 'songs');
  const minutes = Math.round(entries.reduce((sum, e) => sum + (e.track.duration || 0), 0) / 60);
  return minutes > 0 ? `${count}, ${minutes} min` : count;
}

/**
 * The tall player stacks a 132pt cover beside the title and spends the rest on
 * the lyrics and up next card. Below this much room for the card, the card
 * goes and the classic large cover comes back, before any control shrinks.
 */
export const PEEK_CARD_MIN_HEIGHT = 240;

/** Height the player has for the card once the fixed rows are placed. */
export function peekCardRoom(screenHeight: number, insetTop: number, insetBottom: number): number {
  // Top bar 50, cover row 150, seek 52, transport 86, actions 88, gaps 46.
  return screenHeight - insetTop - Math.max(insetBottom, 12) - 472;
}
