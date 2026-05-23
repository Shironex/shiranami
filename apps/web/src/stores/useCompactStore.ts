import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';
import { IS_ELECTRON } from '@/lib/platform';

export type CompactSize = 'sm' | 'md' | 'lg';
export type CompactFontSize = 'sm' | 'md' | 'lg';

// --- Compact mode dimension presets ---
//
// Width/height values are forwarded over IPC to the Electron main process
// which applies them via setMinimumSize/setMaximumSize/setSize. Keep these
// matched with `apps/desktop/src/main/ipc/window.ts` if either side moves.
export const COMPACT_SIZE_DEFAULT: CompactSize = 'md';
export const COMPACT_DIMENSIONS: Record<CompactSize, { width: number; height: number }> = {
  sm: { width: 420, height: 200 },
  md: { width: 500, height: 214 },
  lg: { width: 600, height: 260 },
};

// --- Compact mode appearance prefs ---
export const COMPACT_AMBIENT_INTENSITY_MIN = 0;
export const COMPACT_AMBIENT_INTENSITY_MAX = 0.2;
export const COMPACT_AMBIENT_INTENSITY_STEP = 0.01;
export const COMPACT_AMBIENT_INTENSITY_DEFAULT = 0.08;

export const COMPACT_FONT_SIZE_DEFAULT: CompactFontSize = 'md';

/** Tailwind class lookups for the title / artist / album text in compact view. */
export const CMP_TITLE_CLASS: Record<CompactFontSize, string> = {
  sm: 'text-xs font-semibold',
  md: 'text-sm font-semibold',
  lg: 'text-base font-semibold',
};
export const CMP_ARTIST_CLASS: Record<CompactFontSize, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
};
export const CMP_ALBUM_CLASS: Record<CompactFontSize, string> = {
  sm: 'text-[10px]',
  md: 'text-[11px]',
  lg: 'text-xs',
};

const STORE_KEY = 'shiranami.compact-store';
const LEGACY_APP_STORE_KEY = 'shiranami.app-store';

function coerceCompactSize(v: unknown): CompactSize {
  return v === 'sm' || v === 'md' || v === 'lg' ? v : COMPACT_SIZE_DEFAULT;
}
function coerceCompactFontSize(v: unknown): CompactFontSize {
  return v === 'sm' || v === 'md' || v === 'lg' ? v : COMPACT_FONT_SIZE_DEFAULT;
}
function clampCompactAmbientIntensity(v: number): number {
  const clamped = Math.min(
    COMPACT_AMBIENT_INTENSITY_MAX,
    Math.max(COMPACT_AMBIENT_INTENSITY_MIN, v)
  );
  const steps = Math.round(clamped / COMPACT_AMBIENT_INTENSITY_STEP);
  return Math.round(steps * COMPACT_AMBIENT_INTENSITY_STEP * 1000) / 1000;
}
function coerceCompactAmbientIntensity(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return COMPACT_AMBIENT_INTENSITY_DEFAULT;
  return clampCompactAmbientIntensity(parsed);
}

interface PersistedCompactState {
  compactMode: boolean;
  compactAlwaysOnTop: boolean;
  compactSize: CompactSize;
  compactFontSize: CompactFontSize;
  compactAmbientIntensity: number;
  compactShowAlbumArt: boolean;
  compactShowAlbum: boolean;
  compactShowSeek: boolean;
  compactShowVolume: boolean;
  compactShowFavorite: boolean;
  compactShowLyrics: boolean;
  compactDefaultAlwaysOnTop: boolean;
}

function sanitize(
  persisted: Partial<PersistedCompactState> | undefined
): Partial<PersistedCompactState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedCompactState> = {};
  if (typeof persisted.compactMode === 'boolean') out.compactMode = persisted.compactMode;
  if (typeof persisted.compactAlwaysOnTop === 'boolean')
    out.compactAlwaysOnTop = persisted.compactAlwaysOnTop;
  if (persisted.compactSize !== undefined)
    out.compactSize = coerceCompactSize(persisted.compactSize);
  if (persisted.compactFontSize !== undefined)
    out.compactFontSize = coerceCompactFontSize(persisted.compactFontSize);
  if (persisted.compactAmbientIntensity !== undefined)
    out.compactAmbientIntensity = coerceCompactAmbientIntensity(persisted.compactAmbientIntensity);
  if (typeof persisted.compactShowAlbumArt === 'boolean')
    out.compactShowAlbumArt = persisted.compactShowAlbumArt;
  if (typeof persisted.compactShowAlbum === 'boolean')
    out.compactShowAlbum = persisted.compactShowAlbum;
  if (typeof persisted.compactShowSeek === 'boolean')
    out.compactShowSeek = persisted.compactShowSeek;
  if (typeof persisted.compactShowVolume === 'boolean')
    out.compactShowVolume = persisted.compactShowVolume;
  if (typeof persisted.compactShowFavorite === 'boolean')
    out.compactShowFavorite = persisted.compactShowFavorite;
  if (typeof persisted.compactShowLyrics === 'boolean')
    out.compactShowLyrics = persisted.compactShowLyrics;
  if (typeof persisted.compactDefaultAlwaysOnTop === 'boolean')
    out.compactDefaultAlwaysOnTop = persisted.compactDefaultAlwaysOnTop;
  return out;
}

/**
 * One-shot import from the pre-split combined `shiranami.app-store` key.
 * Compact-mode state used to live in that bucket; on first load we lift
 * the relevant fields into our own bucket so existing users keep their
 * compact preferences. Subsequent loads find our bucket populated and
 * skip. The legacy bucket is left intact for the other slices to do
 * their own one-shot imports.
 */
function importFromLegacyAppStore() {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage;
  if (ls.getItem(STORE_KEY)) return;
  const raw = ls.getItem(LEGACY_APP_STORE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { state?: Partial<PersistedCompactState> };
    const state = sanitize(parsed.state);
    if (Object.keys(state).length === 0) return;
    ls.setItem(STORE_KEY, JSON.stringify({ state, version: 1 }));
  } catch {
    /* malformed legacy bucket — let the new store start empty */
  }
}

importFromLegacyAppStore();

interface CompactState {
  compactMode: boolean;
  compactAlwaysOnTop: boolean;
  compactSize: CompactSize;
  compactFontSize: CompactFontSize;
  compactAmbientIntensity: number;
  compactShowAlbumArt: boolean;
  compactShowAlbum: boolean;
  compactShowSeek: boolean;
  compactShowVolume: boolean;
  compactShowFavorite: boolean;
  compactShowLyrics: boolean;
  compactDefaultAlwaysOnTop: boolean;
}

interface CompactActions {
  setCompactMode: (compactMode: boolean) => Promise<void>;
  setCompactAlwaysOnTop: (compactAlwaysOnTop: boolean) => Promise<void>;
  toggleCompactMode: () => Promise<void>;
  toggleCompactAlwaysOnTop: () => Promise<void>;
  setCompactSize: (size: CompactSize) => void;
  setCompactFontSize: (size: CompactFontSize) => void;
  setCompactAmbientIntensity: (value: number) => void;
  setCompactShowAlbumArt: (visible: boolean) => void;
  setCompactShowAlbum: (visible: boolean) => void;
  setCompactShowSeek: (visible: boolean) => void;
  setCompactShowVolume: (visible: boolean) => void;
  setCompactShowFavorite: (visible: boolean) => void;
  setCompactShowLyrics: (visible: boolean) => void;
  setCompactDefaultAlwaysOnTop: (enabled: boolean) => void;
  resetCompactAppearance: () => void;
}

export const useCompactStore = createPersistedStore<CompactState & CompactActions>(
  (set, get) => ({
    compactMode: false,
    compactAlwaysOnTop: false,
    compactSize: COMPACT_SIZE_DEFAULT,
    compactFontSize: COMPACT_FONT_SIZE_DEFAULT,
    compactAmbientIntensity: COMPACT_AMBIENT_INTENSITY_DEFAULT,
    compactShowAlbumArt: true,
    compactShowAlbum: true,
    compactShowSeek: true,
    compactShowVolume: true,
    compactShowFavorite: false,
    compactShowLyrics: false,
    compactDefaultAlwaysOnTop: false,

    setCompactMode: async compactMode => {
      const previous = get().compactMode;
      if (previous === compactMode) return;

      // When the user has opted into "default to always-on-top in compact",
      // seed the runtime flag on entry. We seed before persisting because
      // setCompactAlwaysOnTop short-circuits when not yet in compact mode,
      // so we just write the value directly here.
      const previousAlwaysOnTop = get().compactAlwaysOnTop;
      if (compactMode && get().compactDefaultAlwaysOnTop && !previousAlwaysOnTop) {
        set({ compactAlwaysOnTop: true });
      }

      set({ compactMode });

      if (!IS_ELECTRON) return;

      try {
        const dims = COMPACT_DIMENSIONS[get().compactSize];
        await window.electronAPI.window.setCompactMode(compactMode, dims);
      } catch {
        // Compact-mode IPC failed: undo the store flips and bail before
        // touching always-on-top so we don't pin a window the user thinks
        // is still in normal mode.
        set({ compactMode: previous, compactAlwaysOnTop: previousAlwaysOnTop });
        return;
      }

      if (get().compactAlwaysOnTop) {
        try {
          await window.electronAPI.window.setAlwaysOnTop(compactMode);
        } catch {
          // Compact succeeded but pin failed: only roll back the pin —
          // the OS window is correctly in/out of compact mode now.
          set({ compactAlwaysOnTop: previousAlwaysOnTop });
        }
      }
    },
    setCompactAlwaysOnTop: async compactAlwaysOnTop => {
      const previous = get().compactAlwaysOnTop;
      if (previous === compactAlwaysOnTop) return;

      set({ compactAlwaysOnTop });

      if (!IS_ELECTRON || !get().compactMode) return;

      try {
        await window.electronAPI.window.setAlwaysOnTop(compactAlwaysOnTop);
      } catch {
        set({ compactAlwaysOnTop: previous });
      }
    },
    toggleCompactMode: async () => {
      await get().setCompactMode(!get().compactMode);
    },
    toggleCompactAlwaysOnTop: async () => {
      await get().setCompactAlwaysOnTop(!get().compactAlwaysOnTop);
    },
    setCompactSize: size => {
      const next = coerceCompactSize(size);
      set({ compactSize: next });
      // If the window is currently in compact mode, push the new dimensions
      // immediately so the preset switch is reflected without a re-toggle.
      if (IS_ELECTRON && get().compactMode) {
        const dims = COMPACT_DIMENSIONS[next];
        window.electronAPI.window.setCompactMode(true, dims).catch(() => {
          // Failure to resize is non-fatal; the next enter-compact will retry.
        });
      }
    },
    setCompactFontSize: size => {
      set({ compactFontSize: coerceCompactFontSize(size) });
    },
    setCompactAmbientIntensity: value => {
      set({ compactAmbientIntensity: coerceCompactAmbientIntensity(value) });
    },
    setCompactShowAlbumArt: visible => set({ compactShowAlbumArt: visible }),
    setCompactShowAlbum: visible => set({ compactShowAlbum: visible }),
    setCompactShowSeek: visible => set({ compactShowSeek: visible }),
    setCompactShowVolume: visible => set({ compactShowVolume: visible }),
    setCompactShowFavorite: visible => set({ compactShowFavorite: visible }),
    setCompactShowLyrics: visible => set({ compactShowLyrics: visible }),
    setCompactDefaultAlwaysOnTop: enabled => set({ compactDefaultAlwaysOnTop: enabled }),
    resetCompactAppearance: () => {
      set({
        compactSize: COMPACT_SIZE_DEFAULT,
        compactFontSize: COMPACT_FONT_SIZE_DEFAULT,
        compactAmbientIntensity: COMPACT_AMBIENT_INTENSITY_DEFAULT,
        compactShowAlbumArt: true,
        compactShowAlbum: true,
        compactShowSeek: true,
        compactShowVolume: true,
        compactShowFavorite: false,
        compactShowLyrics: false,
        compactDefaultAlwaysOnTop: false,
      });
    },
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: (s): PersistedCompactState => ({
      compactMode: s.compactMode,
      compactAlwaysOnTop: s.compactAlwaysOnTop,
      compactSize: s.compactSize,
      compactFontSize: s.compactFontSize,
      compactAmbientIntensity: s.compactAmbientIntensity,
      compactShowAlbumArt: s.compactShowAlbumArt,
      compactShowAlbum: s.compactShowAlbum,
      compactShowSeek: s.compactShowSeek,
      compactShowVolume: s.compactShowVolume,
      compactShowFavorite: s.compactShowFavorite,
      compactShowLyrics: s.compactShowLyrics,
      compactDefaultAlwaysOnTop: s.compactDefaultAlwaysOnTop,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedCompactState>),
    }),
    onRehydrate: state => {
      // Re-apply compact mode at the OS-window level after rehydrate so
      // users who quit while in compact mode come back into compact mode.
      // The renderer flag is restored by zustand-persist; here we just
      // forward to Electron so the window itself resizes/locks again.
      if (IS_ELECTRON && state.compactMode) {
        // Sequence the IPCs: pin only after compact takes hold, otherwise
        // we could end up pinning a window that didn't make it into
        // compact mode. Mutating `state` here is ineffective (rehydration
        // has already merged), so any rollback has to go through setState.
        void (async () => {
          const dims = COMPACT_DIMENSIONS[state.compactSize];
          try {
            await window.electronAPI.window.setCompactMode(true, dims);
          } catch {
            useCompactStore.setState({ compactMode: false, compactAlwaysOnTop: false });
            return;
          }
          if (state.compactAlwaysOnTop) {
            try {
              await window.electronAPI.window.setAlwaysOnTop(true);
            } catch {
              useCompactStore.setState({ compactAlwaysOnTop: false });
            }
          }
        })();
      }
    },
  }
);

acceptStoreHmr(useCompactStore, import.meta.hot);
