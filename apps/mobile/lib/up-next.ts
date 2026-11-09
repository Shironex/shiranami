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
