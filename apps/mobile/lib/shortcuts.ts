import type { Action } from 'expo-quick-actions';
import type { LastPlayed } from '@/lib/last-played';
import type { RadioStation } from '@/lib/radio';
import type { Track } from '@/stores/usePlayerStore';

export type ShortcutId = 'resume' | 'radio' | 'radio-station' | 'shuffle';

/** Longest station name shown in a shortcut label before it is cut. */
const STATION_LABEL_MAX = 22;

/** Icon names are the drawables the config plugin generates (see app.json). */
const ICON = { resume: 'shortcut_play', radio: 'shortcut_radio', shuffle: 'shortcut_shuffle' };

function stationLabel(name: string): string {
  const label = name.length > STATION_LABEL_MAX ? `${name.slice(0, STATION_LABEL_MAX - 1)}…` : name;
  return `Play ${label}`;
}

/**
 * The shortcuts to offer, in order. Resume needs a last track that is still in
 * the library, Shuffle needs a library, and Radio turns into "Play <station>"
 * once a station has played.
 */
export function buildShortcutItems(library: Track[], last: LastPlayed): Action[] {
  const items: Action[] = [];
  if (last.track && library.some(t => t.id === last.track?.id)) {
    items.push({ id: 'resume', title: 'Resume', icon: ICON.resume });
  }
  items.push(
    last.station
      ? { id: 'radio-station', title: stationLabel(last.station.name), icon: ICON.radio }
      : { id: 'radio', title: 'Radio', icon: ICON.radio }
  );
  if (library.length > 0) {
    items.push({ id: 'shuffle', title: 'Shuffle library', icon: ICON.shuffle });
  }
  return items;
}

export interface ShortcutDeps {
  getLibrary: () => Track[];
  /** Reads what is saved, so a shortcut acts on the latest state, not on a stale label. */
  getLast: () => LastPlayed;
  openLibrary: () => void;
  openRadio: () => void;
  playTrack: (list: Track[], index: number, position: number) => void;
  playShuffled: (list: Track[]) => void;
  playStation: (station: RadioStation) => void;
}

/**
 * Does what a tapped shortcut says. A shortcut whose data is gone (library
 * emptied, track deleted since the label was set) falls back to opening the
 * matching screen instead of doing nothing.
 */
export function runShortcut(id: string, deps: ShortcutDeps): void {
  const library = deps.getLibrary();
  const last = deps.getLast();
  switch (id as ShortcutId) {
    case 'resume': {
      deps.openLibrary();
      const index = last.track ? library.findIndex(t => t.id === last.track?.id) : -1;
      if (last.track && index >= 0) deps.playTrack(library, index, last.track.position);
      return;
    }
    case 'radio-station':
      deps.openRadio();
      if (last.station) deps.playStation(last.station);
      return;
    case 'radio':
      deps.openRadio();
      return;
    case 'shuffle':
      deps.openLibrary();
      if (library.length > 0) deps.playShuffled(library);
      return;
  }
}
