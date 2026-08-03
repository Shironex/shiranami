import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';

/**
 * Which weekly recap Overview is currently revealing, and since when.
 *
 * Recaps themselves are never stored — every card is recomputed from
 * `play_history` on demand (the archive included). The only thing worth
 * remembering is *presentation* state: the week the card was first revealed
 * for and the moment that happened, so the card lingers a few days from when
 * this user actually saw it (someone opening the app on Thursday still gets
 * their Monday card) and then folds itself away.
 *
 * localStorage-only: losing it merely re-reveals the latest card once.
 */

const STORE_KEY = 'shiranami.recap';

interface PersistedRecapState {
  /** Week key (`YYYY-MM-DD` of the Monday) of the card being revealed, or null. */
  shownWeekKey: string | null;
  /** Epoch ms when that card was first rendered. */
  firstShownAt: number | null;
}

interface RecapActions {
  /** Stamp a week's card as revealed now (no-op if it is already the shown one). */
  noteShown: (weekKey: string) => void;
}

export const useRecapStore = createPersistedStore<PersistedRecapState & RecapActions>(
  (set, get) => ({
    shownWeekKey: null,
    firstShownAt: null,

    noteShown: weekKey => {
      const { shownWeekKey, firstShownAt } = get();
      // Idempotent per week — but a week stamped without a timestamp (a
      // partially-sanitized blob) is re-stamped rather than wedged forever.
      if (shownWeekKey === weekKey && firstShownAt !== null) return;
      set({ shownWeekKey: weekKey, firstShownAt: Date.now() });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ shownWeekKey: s.shownWeekKey, firstShownAt: s.firstShownAt }),
    sanitize: (persisted, current) => {
      const raw = persisted as Partial<PersistedRecapState> | undefined;
      return {
        ...current,
        shownWeekKey: typeof raw?.shownWeekKey === 'string' ? raw.shownWeekKey : null,
        firstShownAt:
          typeof raw?.firstShownAt === 'number' && Number.isFinite(raw.firstShownAt)
            ? raw.firstShownAt
            : null,
      };
    },
  }
);

acceptStoreHmr(useRecapStore, import.meta.hot);
