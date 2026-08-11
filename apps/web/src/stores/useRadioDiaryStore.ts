import { create } from 'zustand';
import type { RadioLogApi, RadioLogEntry, RadioNowPlaying } from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';
import { logger } from '@/lib/logger';

/**
 * How many entries the panel holds for the station it is showing.
 *
 * The table keeps far more (`repo::radio_log::MAX_ROWS`); this is what one
 * station's panel loads, which is days of its titles and still a list someone
 * can scroll to the end of.
 */
const DIARY_PAGE = 100;

/**
 * One station's diary, mirrored for the panel that reads it.
 *
 * Only one station is held at a time — the one being listened to — because that
 * is the only one the panel can show and holding the rest would be a cache with
 * no reader. Switching stations replaces it rather than accumulating.
 */
interface RadioDiaryState {
  /** The station the loaded entries belong to, or null before the first load. */
  stationUuid: string | null;
  /** That station's entries, newest first. */
  entries: RadioLogEntry[];
  isLoading: boolean;
}

interface RadioDiaryActions {
  /** Read a station's diary, replacing whatever was held. */
  load: (stationUuid: string) => Promise<void>;
  /**
   * File one title, and prepend it if it belongs to the station on screen.
   *
   * The renderer calls this from the now-playing event and nowhere else, so
   * there is no timer behind it. A `null` answer is the backend saying the
   * title repeats the station's most recent entry, which is not a failure and
   * changes nothing.
   */
  record: (stationUuid: string, playing: RadioNowPlaying) => Promise<void>;
}

export type RadioDiaryStore = RadioDiaryState & RadioDiaryActions;

/** The diary surface, or undefined on a shell that predates it. */
function diaryApi(): RadioLogApi | undefined {
  if (!IS_ELECTRON) return undefined;
  return window.electronAPI.radio.log;
}

export const useRadioDiaryStore = create<RadioDiaryStore>((set, get) => ({
  stationUuid: null,
  entries: [],
  isLoading: false,

  load: async stationUuid => {
    const api = diaryApi();
    if (!api) return;

    // Switching stations blanks the list first: showing the previous station's
    // titles under the new station's name would be a lie for as long as the
    // read takes.
    const isSameStation = get().stationUuid === stationUuid;
    set({ stationUuid, isLoading: true, entries: isSameStation ? get().entries : [] });
    try {
      const entries = await api.get(stationUuid, DIARY_PAGE);
      // A station switch mid-read wins: its own load has already claimed the
      // slot, and this answer is about a station nobody is looking at.
      if (get().stationUuid !== stationUuid) return;
      set({ entries, isLoading: false });
    } catch (err) {
      logger.warn('[radio] failed to read the station diary:', err);
      if (get().stationUuid !== stationUuid) return;
      set({ isLoading: false });
    }
  },

  record: async (stationUuid, playing) => {
    const api = diaryApi();
    if (!api) return;

    try {
      const entry = await api.record(stationUuid, playing);
      if (!entry) return;
      if (get().stationUuid !== stationUuid) return;
      set(state => ({ entries: [entry, ...state.entries].slice(0, DIARY_PAGE) }));
    } catch (err) {
      logger.warn('[radio] failed to record what the station is playing:', err);
    }
  },
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof useRadioDiaryStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useRadioDiaryStore.setState(data.store.getState());
  }
  data.store = useRadioDiaryStore;
  hot.accept();
}
