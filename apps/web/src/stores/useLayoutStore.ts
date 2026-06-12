import { createPersistedStore, coerceEnum, acceptStoreHmr } from '@/lib/createPersistedStore';

/**
 * Docked positions of the movable shell panels — where the lyrics/queue side
 * panel and the visualizer strip live. Whether a panel shows at all stays in
 * useViewStore/useUIStore; this store only answers "which slot".
 */

const STORE_KEY = 'shiranami.layout-store';

export const SIDE_PANEL_SIDES = ['left', 'right'] as const;
export type SidePanelSide = (typeof SIDE_PANEL_SIDES)[number];

export const VISUALIZER_POSITIONS = ['top', 'bottom'] as const;
export type VisualizerPosition = (typeof VISUALIZER_POSITIONS)[number];

export const SIDE_PANEL_SIDE_DEFAULT: SidePanelSide = 'right';
export const VISUALIZER_POSITION_DEFAULT: VisualizerPosition = 'bottom';

interface PersistedLayoutState {
  sidePanelSide: SidePanelSide;
  visualizerPosition: VisualizerPosition;
}

interface LayoutState extends PersistedLayoutState {
  setSidePanelSide: (side: SidePanelSide) => void;
  setVisualizerPosition: (pos: VisualizerPosition) => void;
  resetLayout: () => void;
}

function sanitize(persisted: Partial<PersistedLayoutState> | undefined): PersistedLayoutState {
  const raw = persisted && typeof persisted === 'object' ? persisted : {};
  return {
    sidePanelSide: coerceEnum(raw.sidePanelSide, SIDE_PANEL_SIDES, SIDE_PANEL_SIDE_DEFAULT),
    visualizerPosition: coerceEnum(
      raw.visualizerPosition,
      VISUALIZER_POSITIONS,
      VISUALIZER_POSITION_DEFAULT
    ),
  };
}

export const useLayoutStore = createPersistedStore<LayoutState>(
  set => ({
    sidePanelSide: SIDE_PANEL_SIDE_DEFAULT,
    visualizerPosition: VISUALIZER_POSITION_DEFAULT,

    setSidePanelSide: side => {
      set({ sidePanelSide: coerceEnum(side, SIDE_PANEL_SIDES, SIDE_PANEL_SIDE_DEFAULT) });
    },
    setVisualizerPosition: pos => {
      set({
        visualizerPosition: coerceEnum(pos, VISUALIZER_POSITIONS, VISUALIZER_POSITION_DEFAULT),
      });
    },
    resetLayout: () =>
      set({
        sidePanelSide: SIDE_PANEL_SIDE_DEFAULT,
        visualizerPosition: VISUALIZER_POSITION_DEFAULT,
      }),
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedLayoutState => ({
      sidePanelSide: s.sidePanelSide,
      visualizerPosition: s.visualizerPosition,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedLayoutState>),
    }),
  }
);

acceptStoreHmr(useLayoutStore, import.meta.hot);
