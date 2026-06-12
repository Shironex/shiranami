import { createPersistedStore, clampNumber, acceptStoreHmr } from '@/lib/createPersistedStore';

export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 320;
export const SIDEBAR_WIDTH_DEFAULT = 200; // matches the former fixed w-[12.5rem]

export const RIGHT_PANEL_WIDTH_MIN = 260;
export const RIGHT_PANEL_WIDTH_MAX = 480;
export const RIGHT_PANEL_WIDTH_DEFAULT = 320; // matches the former fixed w-[320px]

const STORE_KEY = 'shiranami.panel-size-store';

interface PersistedPanelSizeState {
  sidebarWidth: number;
  rightPanelWidth: number;
}

interface PanelSizeState extends PersistedPanelSizeState {
  setSidebarWidth: (v: number) => void;
  setRightPanelWidth: (v: number) => void;
  resetSidebarWidth: () => void;
  resetRightPanelWidth: () => void;
}

function sanitize(
  persisted: Partial<PersistedPanelSizeState> | undefined
): Partial<PersistedPanelSizeState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedPanelSizeState> = {};
  if (persisted.sidebarWidth !== undefined)
    out.sidebarWidth = clampNumber(
      persisted.sidebarWidth,
      SIDEBAR_WIDTH_MIN,
      SIDEBAR_WIDTH_MAX,
      SIDEBAR_WIDTH_DEFAULT
    );
  if (persisted.rightPanelWidth !== undefined)
    out.rightPanelWidth = clampNumber(
      persisted.rightPanelWidth,
      RIGHT_PANEL_WIDTH_MIN,
      RIGHT_PANEL_WIDTH_MAX,
      RIGHT_PANEL_WIDTH_DEFAULT
    );
  return out;
}

/** Widths of the user-resizable shell panels, persisted across sessions. */
export const usePanelSizeStore = createPersistedStore<PanelSizeState>(
  set => ({
    sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
    rightPanelWidth: RIGHT_PANEL_WIDTH_DEFAULT,

    setSidebarWidth: v => {
      set({
        sidebarWidth: clampNumber(v, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_DEFAULT),
      });
    },
    setRightPanelWidth: v => {
      set({
        rightPanelWidth: clampNumber(
          v,
          RIGHT_PANEL_WIDTH_MIN,
          RIGHT_PANEL_WIDTH_MAX,
          RIGHT_PANEL_WIDTH_DEFAULT
        ),
      });
    },
    resetSidebarWidth: () => set({ sidebarWidth: SIDEBAR_WIDTH_DEFAULT }),
    resetRightPanelWidth: () => set({ rightPanelWidth: RIGHT_PANEL_WIDTH_DEFAULT }),
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedPanelSizeState => ({
      sidebarWidth: s.sidebarWidth,
      rightPanelWidth: s.rightPanelWidth,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedPanelSizeState>),
    }),
  }
);

acceptStoreHmr(usePanelSizeStore, import.meta.hot);
