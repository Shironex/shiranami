import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import {
  DEFAULT_KEYMAP,
  SHORTCUT_ACTION_IDS,
  bindingEquals,
  bindingsCollide,
  findReservedChord,
  sanitizeBinding,
  type KeyBinding,
  type ShortcutActionId,
} from '@/lib/keymap';

/**
 * User keyboard-shortcut remaps. Only the deviations from `DEFAULT_KEYMAP`
 * are persisted (`overrides`), so a future change to a default reaches every
 * user who hasn't rebound that action. `bindings` is the materialized
 * defaults-plus-overrides map the keyboard handler and every shortcut label
 * render from; it is recomputed on write and on rehydration, never persisted.
 */

const STORE_KEY = 'shiranami.keymap-store';

type KeymapOverrides = Partial<Record<ShortcutActionId, KeyBinding>>;

interface PersistedKeymapState {
  overrides: KeymapOverrides;
}

interface KeymapState extends PersistedKeymapState {
  /** Resolved binding per action: `DEFAULT_KEYMAP` overlaid with `overrides`. */
  bindings: Record<ShortcutActionId, KeyBinding>;
  setBinding: (id: ShortcutActionId, binding: KeyBinding) => void;
  resetBinding: (id: ShortcutActionId) => void;
  resetAllBindings: () => void;
}

function resolveBindings(overrides: KeymapOverrides): Record<ShortcutActionId, KeyBinding> {
  const bindings = { ...DEFAULT_KEYMAP };
  for (const id of SHORTCUT_ACTION_IDS) {
    const override = overrides[id];
    if (override) bindings[id] = override;
  }
  return bindings;
}

/**
 * Validate untrusted persisted overrides: drop unknown action ids and
 * malformed bindings, overrides that just restate the default, chords the app
 * reserves, and any override colliding with an earlier action's resolved
 * binding (corrupt storage must never yield an ambiguous keymap).
 */
function sanitizeOverrides(persisted: unknown): KeymapOverrides {
  if (!persisted || typeof persisted !== 'object') return {};
  const raw = (persisted as { overrides?: unknown }).overrides;
  if (!raw || typeof raw !== 'object') return {};

  const overrides: KeymapOverrides = {};
  for (const id of SHORTCUT_ACTION_IDS) {
    const candidate = sanitizeBinding((raw as Record<string, unknown>)[id]);
    if (!candidate) continue;
    if (bindingEquals(candidate, DEFAULT_KEYMAP[id])) continue;
    if (findReservedChord(candidate)) continue;
    const resolvedSoFar = resolveBindings(overrides);
    const collides = SHORTCUT_ACTION_IDS.some(
      otherId => otherId !== id && bindingsCollide(candidate, id, resolvedSoFar[otherId], otherId)
    );
    if (collides) continue;
    overrides[id] = candidate;
  }
  return overrides;
}

export const useKeymapStore = createPersistedStore<KeymapState>(
  set => ({
    overrides: {},
    bindings: resolveBindings({}),
    setBinding: (id, binding) => {
      set(state => {
        const overrides: KeymapOverrides = { ...state.overrides };
        if (bindingEquals(binding, DEFAULT_KEYMAP[id])) {
          delete overrides[id];
        } else {
          overrides[id] = binding;
        }
        return { overrides, bindings: resolveBindings(overrides) };
      });
    },
    resetBinding: id => {
      set(state => {
        if (!(id in state.overrides)) return state;
        const overrides = { ...state.overrides };
        delete overrides[id];
        return { overrides, bindings: resolveBindings(overrides) };
      });
    },
    resetAllBindings: () => {
      set({ overrides: {}, bindings: resolveBindings({}) });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedKeymapState => ({ overrides: s.overrides }),
    sanitize: (persisted, current) => {
      const overrides = sanitizeOverrides(persisted);
      return { ...current, overrides, bindings: resolveBindings(overrides) };
    },
  }
);

acceptStoreHmr(useKeymapStore, import.meta.hot);
