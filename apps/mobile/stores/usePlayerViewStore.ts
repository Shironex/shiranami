import { create } from 'zustand';

/** The tabs of the player card. */
export type PlayerCardTab = 'lyrics' | 'upNext' | 'similar';

interface PlayerViewState {
  /** The card tab last picked, kept for the session. */
  tab: PlayerCardTab;
  /** The user chose `tab` themselves, so a new song keeps it. */
  picked: boolean;
  /** Shows a tab; `picked` says whether the user chose it. */
  setTab: (tab: PlayerCardTab, picked?: boolean) => void;
}

/** How the player screen was left, so reopening it looks the same. */
export const usePlayerViewStore = create<PlayerViewState>(set => ({
  tab: 'lyrics',
  picked: false,
  setTab: (tab, picked = false) => set({ tab, picked }),
}));
