// e2e-only registry. Loaded by main.tsx ONLY when the preload reports
// `window.electronAPI.__e2e === true` (i.e. main process was launched
// with SHIRANAMI_E2E=1 by Playwright). The registry hands out store
// handles so specs can drive playback, search, EQ etc. via
// `page.evaluate(() => window.__shiranami.stores.playback.getState())`
// instead of clicking through the UI for every assertion.
//
// Never imported in production runtime — the dynamic-import in main.tsx
// keeps this off the critical path and out of the main bundle chunk.

import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useEqStore } from '@/stores/useEqStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { usePlaylistImportStore } from '@/stores/usePlaylistImportStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

interface E2EBridge {
  stores: {
    playback: typeof usePlaybackStore;
    library: typeof useLibraryStore;
    eq: typeof useEqStore;
    ui: typeof useUIStore;
    view: typeof useViewStore;
    playlistImport: typeof usePlaylistImportStore;
    selection: typeof useSelectionStore;
  };
}

declare global {
  interface Window {
    __shiranami?: E2EBridge;
  }
}

window.__shiranami = {
  stores: {
    playback: usePlaybackStore,
    library: useLibraryStore,
    eq: useEqStore,
    ui: useUIStore,
    view: useViewStore,
    playlistImport: usePlaylistImportStore,
    selection: useSelectionStore,
  },
};
