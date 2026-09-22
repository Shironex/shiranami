import { create } from 'zustand';
import {
  companionReduce,
  createCompanionState,
  type CompanionEvent,
  type ICompanionMachineState,
} from '@/lib/companionMachine';

/**
 * Runtime-only home of the companion's state machine plus the environmental
 * flags around it. Nothing here persists — the durable self (stage, xp, name)
 * lives in the Rust ledger and is re-synced through the driver at launch.
 *
 * `dispatch` is the single write path into the machine; the driver
 * (`@/lib/companionDriver`) is its single caller outside tests.
 */

export interface ICompanionLedgerInfo {
  /** User-chosen name from the ledger; null until named (or no backend). */
  name: string | null;
  /** Whole listening hours behind the current stage; null = unknown/no backend. */
  xpHours: number | null;
  /**
   * Worn keepsake ids as the ledger stored them — raw; surfaces sanitize
   * against the catalog and the reached stage at render time.
   */
  accessories: string[];
  /** True when `window.electronAPI.companion` answered — the ledger is live. */
  hasBackend: boolean;
}

interface CompanionRuntimeState {
  machine: ICompanionMachineState;
  /** Window is hidden — every surface drops to its static pose (idle-0% rule). */
  suspended: boolean;
  ledger: ICompanionLedgerInfo;
  dispatch: (event: CompanionEvent) => void;
  setSuspended: (suspended: boolean) => void;
  setLedger: (ledger: Partial<ICompanionLedgerInfo>) => void;
}

export const useCompanionRuntimeStore = create<CompanionRuntimeState>()((set, get) => ({
  machine: createCompanionState(),
  suspended: false,
  ledger: { name: null, xpHours: null, accessories: [], hasBackend: false },

  dispatch: event => {
    const machine = companionReduce(get().machine, event);
    if (machine !== get().machine) set({ machine });
  },
  setSuspended: suspended => {
    if (suspended !== get().suspended) set({ suspended });
  },
  setLedger: ledger => {
    set({ ledger: { ...get().ledger, ...ledger } });
  },
}));

// Preserve across Vite HMR (dev only). The machine re-derives from live inputs
// on the next driver tick, so a stale mode self-heals.
if (import.meta.hot) {
  type HmrData = { store?: typeof useCompanionRuntimeStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useCompanionRuntimeStore.setState(data.store.getState());
  }
  data.store = useCompanionRuntimeStore;
  hot.accept();
}
