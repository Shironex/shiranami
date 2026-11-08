import type { Track } from '@/stores/usePlayerStore';

/** Padding inside the tab row; the selected squircle sits this far from the dock edge. */
export const DOCK_TAB_INSET = 6;
/** Space between the dock and the bottom edge when the system reports no inset. */
export const DOCK_MIN_GAP = 12;
/** Gap kept above the gesture bar or the button bar. */
export const DOCK_INSET_GAP = 2;

/** What the top row of the dock shows: nothing, a song with progress, or a station. */
export type DockPlayerMode = 'none' | 'track' | 'live';

export function dockPlayerMode(track: Track | null): DockPlayerMode {
  if (!track) return 'none';
  return track.isLive ? 'live' : 'track';
}

/** Distance from the bottom edge to the dock, above the system navigation. */
export function dockBottom(insetBottom: number): number {
  return Math.max(insetBottom + DOCK_INSET_GAP, DOCK_MIN_GAP);
}

/** Width of one tab cell (and of the selected squircle) in a row this wide. */
export function dockTabWidth(rowWidth: number, tabCount: number): number {
  if (tabCount <= 0 || rowWidth <= 0) return 0;
  return (rowWidth - DOCK_TAB_INSET * 2) / tabCount;
}

/**
 * Where the selected squircle sits, from the left padding of the row. A route
 * outside the dock (index -1) keeps it on the first tab rather than off screen.
 */
export function dockSliderX(selected: number, rowWidth: number, tabCount: number): number {
  const index = Math.min(Math.max(selected, 0), Math.max(tabCount - 1, 0));
  return index * dockTabWidth(rowWidth, tabCount);
}
