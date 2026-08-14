import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import type { CompanionSpecies } from '@/lib/companionMachine';

/**
 * The companion's local preferences — which species lives here, where it sits
 * on the player bar, and whether it keeps watch in Sanctuary. The *durable*
 * self (stage, xp, name) belongs to the Rust ledger behind
 * `window.electronAPI.companion`; this store is only the renderer-side seat
 * assignment, and doubles as the species fallback when no ledger is present.
 *
 * The master on/off toggle deliberately lives in `useInterfaceStore.companion`
 * with every other optional-chrome key.
 */

const STORE_KEY = 'shiranami.companion-store';

/**
 * Default perch seat as a fraction of the player bar width. 1 leans fully
 * right and is clamped at render time to keep right-of-way for the
 * volume/queue cluster; the default sits a little left of that clamp.
 */
export const COMPANION_DEFAULT_PERCH_FRACTION = 0.74;

export function isCompanionSpecies(v: unknown): v is CompanionSpecies {
  return v === 'shio' || v === 'hotaru';
}

interface PersistedCompanionState {
  species: CompanionSpecies;
  perchFraction: number;
  sanctuaryKeepsWatch: boolean;
  dressForWeather: boolean;
  /**
   * The one-time naming moment has been offered (named or waved away). The
   * pet's *name* lives in the ledger; this only remembers that the ceremony
   * happened, so declining it once is declining it forever — the rename
   * affordance in Settings remains.
   */
  namingCeremonyDone: boolean;
}

const COMPANION_DEFAULTS: PersistedCompanionState = {
  species: 'shio',
  perchFraction: COMPANION_DEFAULT_PERCH_FRACTION,
  sanctuaryKeepsWatch: false,
  dressForWeather: true,
  namingCeremonyDone: false,
};

function clampFraction(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return COMPANION_DEFAULT_PERCH_FRACTION;
  return Math.min(1, Math.max(0, parsed));
}

function sanitize(
  persisted: Partial<PersistedCompanionState> | undefined
): Partial<PersistedCompanionState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedCompanionState> = {};
  if (isCompanionSpecies(persisted.species)) out.species = persisted.species;
  if (persisted.perchFraction !== undefined)
    out.perchFraction = clampFraction(persisted.perchFraction);
  if (typeof persisted.sanctuaryKeepsWatch === 'boolean')
    out.sanctuaryKeepsWatch = persisted.sanctuaryKeepsWatch;
  if (typeof persisted.dressForWeather === 'boolean')
    out.dressForWeather = persisted.dressForWeather;
  if (typeof persisted.namingCeremonyDone === 'boolean')
    out.namingCeremonyDone = persisted.namingCeremonyDone;
  return out;
}

interface CompanionActions {
  setSpecies: (species: CompanionSpecies) => void;
  setPerchFraction: (fraction: number) => void;
  setSanctuaryKeepsWatch: (keepsWatch: boolean) => void;
  setDressForWeather: (dress: boolean) => void;
  setNamingCeremonyDone: () => void;
}

export const useCompanionStore = createPersistedStore<PersistedCompanionState & CompanionActions>(
  set => ({
    ...COMPANION_DEFAULTS,
    setSpecies: species => {
      if (isCompanionSpecies(species)) set({ species });
    },
    setPerchFraction: fraction => {
      set({ perchFraction: clampFraction(fraction) });
    },
    setSanctuaryKeepsWatch: keepsWatch => {
      set({ sanctuaryKeepsWatch: keepsWatch });
    },
    setDressForWeather: dress => {
      set({ dressForWeather: dress });
    },
    setNamingCeremonyDone: () => {
      set({ namingCeremonyDone: true });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedCompanionState => ({
      species: s.species,
      perchFraction: s.perchFraction,
      sanctuaryKeepsWatch: s.sanctuaryKeepsWatch,
      dressForWeather: s.dressForWeather,
      namingCeremonyDone: s.namingCeremonyDone,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedCompanionState>),
    }),
  }
);

acceptStoreHmr(useCompanionStore, import.meta.hot);
