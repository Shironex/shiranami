import { useEffect } from 'react';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import { SHORTCUT_ACTION_IDS, bindingMatchesEvent, type ShortcutActionId } from '@/lib/keymap';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useKeymapStore } from '@/stores/useKeymapStore';
import { useViewStore, type AppView } from '@/stores/useViewStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';

/**
 * Canonical navigation order for the number-key shortcuts and the
 * shortcuts help dialog. Mirrors the default visual order in the Sidebar
 * (`SIDEBAR_NAV_ITEMS` in `lib/sidebar-items.ts`); the number-key targets
 * stay fixed and do not follow the user's custom sidebar order. Each entry
 * pairs the AppView with the i18n label key used in
 * `locales/<lang>/shortcuts.json` so the help dialog can derive its
 * Navigation list from this single source.
 */
export const NAV_VIEWS: Array<{ view: AppView; labelKey: string }> = [
  { view: 'library', labelKey: 'library' },
  { view: 'playlists', labelKey: 'playlists' },
  { view: 'favorites', labelKey: 'favorites' },
  { view: 'history', labelKey: 'history' },
  { view: 'mixes', labelKey: 'mixes' },
  { view: 'search', labelKey: 'search' },
  { view: 'import-playlist', labelKey: 'importPlaylist' },
  { view: 'radio', labelKey: 'radio' },
  { view: 'settings', labelKey: 'settings' },
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[data-radix-portal]')) return true;
  return false;
}

/**
 * One runner per remappable action, keyed by the keymap store's action ids.
 * Which chord fires a runner is decided by the user's keymap; each runner's
 * body is the behavior the legacy hardcoded switch gave that action.
 */
const ACTION_HANDLERS: Record<ShortcutActionId, (e: KeyboardEvent) => void> = {
  playPause: () => {
    usePlaybackStore.getState().togglePlay();
  },
  nextTrack: () => {
    usePlaybackStore.getState().next();
  },
  previousTrack: () => {
    usePlaybackStore.getState().previous();
  },
  seekForward: e => {
    const step = e.shiftKey ? 10 : 5;
    const currentTime = currentTimeRef.current;
    const { duration, seek } = usePlaybackStore.getState();
    seek(Math.min(currentTime + step, duration));
  },
  seekBack: e => {
    const step = e.shiftKey ? 10 : 5;
    const currentTime = currentTimeRef.current;
    const { seek } = usePlaybackStore.getState();
    seek(Math.max(currentTime - step, 0));
  },
  volumeUp: () => {
    const { volume, setVolume } = usePlaybackStore.getState();
    setVolume(Math.min(volume + 0.05, 1));
  },
  volumeDown: () => {
    const { volume, setVolume } = usePlaybackStore.getState();
    setVolume(Math.max(volume - 0.05, 0));
  },
  muteUnmute: () => {
    usePlaybackStore.getState().toggleMute();
  },
  toggleShuffle: () => {
    usePlaybackStore.getState().toggleShuffle();
  },
  cycleRepeat: () => {
    usePlaybackStore.getState().cycleRepeatMode();
  },
  favoriteTrack: () => {
    const currentTrack = usePlaybackStore.getState().currentTrack;
    if (currentTrack) useLibraryStore.getState().toggleFavorite(currentTrack.id);
  },
  toggleSidebar: () => {
    useUIStore.getState().toggleSidebarCollapsed();
  },
  toggleLyrics: () => {
    useViewStore.getState().toggleRightPanel('lyrics');
  },
  toggleQueue: () => {
    useViewStore.getState().toggleRightPanel('queue');
  },
  compactMode: () => {
    useCompactStore.getState().toggleCompactMode();
  },
  toggleAlwaysOnTop: () => {
    // Useful for users who pin the mini-player above other windows (or want
    // to unpin it without leaving the keyboard). Active in both compact and
    // normal modes — the underlying setter is a no-op outside compact, but
    // we still update the persisted preference so the pin sticks the next
    // time compact is entered.
    void useCompactStore.getState().toggleCompactAlwaysOnTop();
  },
  toggleNowPlaying: () => {
    // Setting-gated and requires a track — both silent-failure paths surface
    // as toasts so the user always knows the shortcut was received and why
    // it didn't open the view.
    const { nowPlayingViewEnabled } = useUIStore.getState();
    const { activeView, enterNowPlaying, exitNowPlaying } = useViewStore.getState();
    if (!nowPlayingViewEnabled) {
      toast.info(i18n.t('nowPlayingDisabled', { ns: 'toast' }), {
        id: 'now-playing-disabled',
        duration: 6000,
        action: {
          label: i18n.t('updateSettings', { ns: 'toast' }),
          onClick: () => useViewStore.getState().navigateTo('settings'),
        },
      });
      return;
    }
    if (activeView === 'now-playing') {
      exitNowPlaying();
      return;
    }
    if (!usePlaybackStore.getState().currentTrack) {
      toast.info(i18n.t('nowPlayingNoTrack', { ns: 'toast' }), {
        id: 'now-playing-no-track',
        duration: 4000,
      });
      return;
    }
    enterNowPlaying();
  },
  toggleVisualizer: () => {
    useUIStore.getState().toggleVisualizer();
  },
  toggleSanctuary: () => {
    // Sanctuary Mode is the fullscreen immersive player. Needs a track — the
    // silent-failure path surfaces as a toast, same as the Now Playing
    // shortcut.
    if (!usePlaybackStore.getState().currentTrack) {
      toast.info(i18n.t('sanctuaryNoTrack', { ns: 'toast' }), {
        id: 'sanctuary-no-track',
        duration: 4000,
      });
      return;
    }
    useSanctuaryStore.getState().toggleSanctuary();
  },
  showHelp: () => {
    window.dispatchEvent(new CustomEvent(DIALOG_EVENTS.openShortcutHelp));
  },
};

/** Resolve the action the user's keymap binds to this keydown, if any. */
function matchAction(e: KeyboardEvent): ShortcutActionId | null {
  const { bindings } = useKeymapStore.getState();
  for (const id of SHORTCUT_ACTION_IDS) {
    if (bindingMatchesEvent(bindings[id], id, e)) return id;
  }
  return null;
}

/**
 * Escape stays a fixed key (never remappable): it is the app-wide back/close
 * cascade rather than a single action.
 */
function handleEscape(e: KeyboardEvent): void {
  if (document.querySelector('[data-radix-portal]')) return;
  // Sanctuary sits above everything, so Esc leaves it first.
  const sanctuary = useSanctuaryStore.getState();
  if (sanctuary.sanctuaryActive) {
    e.preventDefault();
    sanctuary.exitSanctuary();
    return;
  }
  // Now Playing is a modal-like full-screen view; Esc should dismiss it
  // before any background-state cleanup. Standard modal interaction.
  const viewState = useViewStore.getState();
  if (viewState.activeView === 'now-playing') {
    e.preventDefault();
    viewState.exitNowPlaying();
    return;
  }
  // Clear track selection first
  const { selectedTrackIds, clearSelection } = useSelectionStore.getState();
  if (selectedTrackIds.size > 0) {
    e.preventDefault();
    clearSelection();
    return;
  }
  if (viewState.rightPanel !== null) {
    e.preventDefault();
    viewState.setRightPanel(null);
  }
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // --- Modifier-key shortcuts (always work regardless of focus) ---
      if (mod) {
        // Cmd/Ctrl+A: select all tracks (only when not in an editable target)
        if ((e.key === 'a' || e.key === 'A') && !isEditableTarget(e.target)) {
          const selectionSize = useSelectionStore.getState().selectedTrackIds.size;
          if (selectionSize > 0) {
            // If already selecting, select all is handled by the bulk action bar
            // We just prevent the default browser select-all
            e.preventDefault();
            return;
          }
        }

        const actionId = matchAction(e);
        if (actionId) {
          e.preventDefault();
          ACTION_HANDLERS[actionId](e);
        }
        // Don't handle other modifier combos (e.g. Ctrl+K is CommandPalette)
        return;
      }

      // --- Single-key shortcuts (guarded against editable targets) ---

      // Space activates a focused button; never hijack the physical key
      // there, regardless of which action it is bound to.
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return;

      if (isEditableTarget(e.target)) return;

      const actionId = matchAction(e);
      if (actionId) {
        e.preventDefault();
        ACTION_HANDLERS[actionId](e);
        return;
      }

      // --- Fixed keys (not part of the remappable keymap) ---
      if (e.key === 'Escape') {
        handleEscape(e);
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const entry = NAV_VIEWS[parseInt(e.key) - 1];
        if (!entry) return;
        e.preventDefault();
        useViewStore.getState().navigateTo(entry.view);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
