import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as QuickActions from 'expo-quick-actions';
import { useLastPlayedStore } from '@/lib/last-played';
import { buildShortcutItems, runShortcut, type ShortcutDeps } from '@/lib/shortcuts';
import { stationTrack } from '@/lib/radio';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useRadioStore } from '@/stores/useRadioStore';

/** Gives up waiting for a track to load before seeking to its saved position, in ms. */
const SEEK_WAIT_MS = 8000;

/** Seeks to `position` once the new track reports a duration. */
function seekWhenLoaded(trackId: string, position: number): void {
  if (position <= 0) return;
  let done = false;
  const timer = setTimeout(() => finish(), SEEK_WAIT_MS);
  function finish() {
    done = true;
    unsubscribe();
    clearTimeout(timer);
  }
  const unsubscribe = usePlayerStore.subscribe(state => {
    if (done) return;
    if (state.currentTrack?.id !== trackId) return finish();
    if (state.duration > 0) {
      finish();
      state.seek(position);
    }
  });
}

/** The shortcut that opened the app is acted on once per process, not on every remount. */
let initialConsumed = false;

/**
 * Keeps the launcher shortcuts (long press on the app icon) current and acts
 * on them. A shortcut that cold starts the app waits until the library and the
 * saved state have loaded; one that arrives while the app runs is queued the
 * same way if it comes early. Call from the tabs layout, where the router is
 * ready and the data loads start.
 */
export function useAppShortcuts(libraryLoaded: boolean): void {
  const router = useRouter();
  const library = usePlayerStore(s => s.library);
  const lastLoaded = useLastPlayedStore(s => s.loaded);
  const lastTrackId = useLastPlayedStore(s => s.track?.id);
  const lastStationId = useLastPlayedStore(s => s.station?.id);
  const ready = libraryLoaded && lastLoaded;

  const pending = useRef<string | null>(null);
  const readyRef = useRef(false);
  readyRef.current = ready;

  const depsRef = useRef<ShortcutDeps | null>(null);
  depsRef.current = {
    getLibrary: () => usePlayerStore.getState().library,
    getLast: () => useLastPlayedStore.getState(),
    openLibrary: () => router.navigate('/'),
    openRadio: () => router.navigate('/radio'),
    playTrack: (list, index, position) => {
      const player = usePlayerStore.getState();
      if (player.currentTrack?.id === list[index].id) {
        player.play();
        return;
      }
      player.playFromList(list, index);
      seekWhenLoaded(list[index].id, position);
    },
    playShuffled: list => usePlayerStore.getState().playShuffled(list),
    playStation: station => {
      useRadioStore.getState().setCurrentStation(station.id);
      usePlayerStore.getState().playFromList([stationTrack(station)], 0, 'Radio');
    },
  };

  useEffect(() => {
    const handle = (id: string) => {
      if (!readyRef.current || !depsRef.current) {
        pending.current = id;
        return;
      }
      runShortcut(id, depsRef.current);
    };
    if (QuickActions.initial && !initialConsumed) {
      initialConsumed = true;
      handle(QuickActions.initial.id);
    }
    const subscription = QuickActions.addListener(action => handle(action.id));
    return () => subscription.remove();
  }, []);

  // A shortcut tapped before the data was ready runs as soon as it is.
  useEffect(() => {
    if (!ready || pending.current === null || !depsRef.current) return;
    const id = pending.current;
    pending.current = null;
    runShortcut(id, depsRef.current);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const { track, station } = useLastPlayedStore.getState();
    QuickActions.setItems(buildShortcutItems(library, { track, station })).catch(() => undefined);
  }, [ready, library, lastTrackId, lastStationId]);
}
