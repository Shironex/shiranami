import { create } from 'zustand';

/** The tabs of the player card. */
export type PlayerCardTab = 'lyrics' | 'upNext' | 'similar';

interface PlayerViewState {
  /** The card tab last picked, kept for the session. */
  tab: PlayerCardTab;
  setTab: (tab: PlayerCardTab) => void;
}

/** How the player screen was left, so reopening it looks the same. */
export const usePlayerViewStore = create<PlayerViewState>(set => ({
  tab: 'lyrics',
  setTab: tab => set({ tab }),
}));
