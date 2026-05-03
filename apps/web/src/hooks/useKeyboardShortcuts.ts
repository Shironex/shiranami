import { useEffect } from 'react';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useAppStore } from '@/stores/useAppStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useViewStore, type AppView } from '@/stores/useViewStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

/**
 * Canonical navigation order for the number-key shortcuts and the
 * shortcuts help dialog. Mirrors the visual order in the Sidebar
 * (`NAV_ITEMS` in Sidebar.tsx). Each entry pairs the AppView with the
 * i18n label key used in `locales/<lang>/shortcuts.json` so the help
 * dialog can derive its Navigation list from this single source.
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

        switch (e.key) {
          case 'b':
          case 'B': {
            e.preventDefault();
            useAppStore.getState().toggleSidebarCollapsed();
            return;
          }
          case 'l':
          case 'L': {
            if (!e.shiftKey) {
              e.preventDefault();
              useViewStore.getState().toggleRightPanel('lyrics');
              return;
            }
            break;
          }
          case 'q':
          case 'Q': {
            if (!e.shiftKey) {
              e.preventDefault();
              useViewStore.getState().toggleRightPanel('queue');
              return;
            }
            break;
          }
          case 'M':
          case 'm': {
            if (e.shiftKey) {
              e.preventDefault();
              useCompactStore.getState().toggleCompactMode();
              return;
            }
            break;
          }
          case 'T':
          case 't': {
            // Ctrl/Cmd+Shift+T: toggle always-on-top. Useful for users who
            // pin the mini-player above other windows (or want to unpin it
            // without leaving the keyboard). Active in both compact and
            // normal modes — the underlying setter is a no-op outside
            // compact, but we still update the persisted preference so the
            // pin sticks the next time compact is entered.
            if (e.shiftKey) {
              e.preventDefault();
              void useCompactStore.getState().toggleCompactAlwaysOnTop();
              return;
            }
            break;
          }
          case 'P':
          case 'p': {
            // Ctrl/Cmd+Shift+P: toggle Now Playing view.
            // Setting-gated and requires a track — both silent-failure
            // paths now surface as toasts so the user always knows the
            // shortcut was received and why it didn't open the view.
            if (e.shiftKey) {
              e.preventDefault();
              const { nowPlayingViewEnabled } = useAppStore.getState();
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
              return;
            }
            break;
          }
        }
        // Don't handle other modifier combos (e.g. Ctrl+K is CommandPalette)
        return;
      }

      // --- Single-key shortcuts (guarded against editable targets) ---
      const guarded = isEditableTarget(e.target);

      if (e.key === ' ') {
        if (guarded || e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        usePlaybackStore.getState().togglePlay();
        return;
      }

      if (guarded) return;

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 5;
          const currentTime = currentTimeRef.current;
          const { duration, seek } = usePlaybackStore.getState();
          seek(Math.min(currentTime + step, duration));
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 5;
          const currentTime = currentTimeRef.current;
          const { seek } = usePlaybackStore.getState();
          seek(Math.max(currentTime - step, 0));
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const { volume, setVolume } = usePlaybackStore.getState();
          setVolume(Math.min(volume + 0.05, 1));
          return;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const { volume, setVolume } = usePlaybackStore.getState();
          setVolume(Math.max(volume - 0.05, 0));
          return;
        }
        case 'M':
        case 'm': {
          e.preventDefault();
          usePlaybackStore.getState().toggleMute();
          return;
        }
        case 'N':
        case 'n': {
          e.preventDefault();
          usePlaybackStore.getState().next();
          return;
        }
        case 'P':
        case 'p': {
          e.preventDefault();
          usePlaybackStore.getState().previous();
          return;
        }
        case 'S':
        case 's': {
          e.preventDefault();
          usePlaybackStore.getState().toggleShuffle();
          return;
        }
        case 'R':
        case 'r': {
          e.preventDefault();
          usePlaybackStore.getState().cycleRepeatMode();
          return;
        }
        case 'L':
        case 'l': {
          e.preventDefault();
          const currentTrack = usePlaybackStore.getState().currentTrack;
          if (currentTrack) useLibraryStore.getState().toggleFavorite(currentTrack.id);
          return;
        }
        case 'V':
        case 'v': {
          e.preventDefault();
          useAppStore.getState().toggleVisualizer();
          return;
        }
        case '?': {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('open-shortcut-help'));
          return;
        }
        case 'Escape': {
          if (document.querySelector('[data-radix-portal]')) return;
          // Now Playing is a modal-like full-screen view; Esc should
          // dismiss it before any background-state cleanup. Standard
          // modal interaction.
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
          return;
        }
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          const entry = NAV_VIEWS[parseInt(e.key) - 1];
          if (!entry) return;
          e.preventDefault();
          useViewStore.getState().navigateTo(entry.view);
          return;
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
