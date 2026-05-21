// Dev-only per-store Zustand update-frequency (Hz) counter for the Debug Panel.
//
// The single best predictor of wasted renders is a store that `set()`s many
// times per second while the window is open (e.g. a per-frame playback write).
// We `store.subscribe()` to a curated set of the hottest stores and count calls
// over a rolling 1s window, exposing updates/sec per store.
//
// Cheap and revealing — a subscribe callback that bumps a counter. Gated behind
// the dev flag and only started while the overlay is open.

import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { useViewStore } from '@/stores/useViewStore';

interface Subscribable {
  subscribe: (listener: () => void) => () => void;
}

const TRACKED_STORES: Record<string, Subscribable> = {
  playback: usePlaybackStore,
  library: useLibraryStore,
  ui: useUIStore,
  selection: useSelectionStore,
  playerUI: usePlayerUIStore,
  view: useViewStore,
};

const counts = new Map<string, number>();
let lastReset = 0;
let lastWindowMs = 1;
let unsubscribers: Array<() => void> = [];

export function startStoreHz(): void {
  if (unsubscribers.length > 0) return;
  counts.clear();
  lastReset = performance.now();
  for (const [name, store] of Object.entries(TRACKED_STORES)) {
    counts.set(name, 0);
    unsubscribers.push(
      store.subscribe(() => {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      })
    );
  }
}

export function stopStoreHz(): void {
  for (const off of unsubscribers) off();
  unsubscribers = [];
  counts.clear();
}

/**
 * Reads the per-store update rate (Hz) since the last call and resets the
 * window. Call on the overlay's sampling cadence (~2 Hz), not per-frame.
 */
export function sampleStoreHz(): Record<string, number> {
  const now = performance.now();
  const elapsed = (now - lastReset) / 1000;
  lastWindowMs = Math.max(elapsed, 1 / 1000);
  const out: Record<string, number> = {};
  for (const [name, count] of counts.entries()) {
    out[name] = Math.round(count / lastWindowMs);
    counts.set(name, 0);
  }
  lastReset = now;
  return out;
}
