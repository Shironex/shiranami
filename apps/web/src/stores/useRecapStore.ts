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

interface RecapState extends PersistedRecapState {
  /**
   * Overview's recap card is on screen right now. Transient — never persisted;
   * mirrored by the Overview surface so the companion driver can cameo on the
   * card's appearance without reaching into the DOM.
   */
  cardVisible: boolean;
}

interface RecapActions {
  /** Stamp a week's card as revealed now (no-op if it is already the shown one). */
  noteShown: (weekKey: string) => void;
  /** Mirror whether the Overview card is currently rendered. */
  setCardVisible: (visible: boolean) => void;
}

export const useRecapStore = createPersistedStore<RecapState & RecapActions>(
  (set, get) => ({
    shownWeekKey: null,
    firstShownAt: null,
    cardVisible: false,

    noteShown: weekKey => {
      const { shownWeekKey, firstShownAt } = get();
      // Idempotent per week — but a week stamped without a timestamp (a
      // partially-sanitized blob) is re-stamped rather than wedged forever.
      if (shownWeekKey === weekKey && firstShownAt !== null) return;
      set({ shownWeekKey: weekKey, firstShownAt: Date.now() });
    },

    setCardVisible: visible => {
      if (visible !== get().cardVisible) set({ cardVisible: visible });
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
