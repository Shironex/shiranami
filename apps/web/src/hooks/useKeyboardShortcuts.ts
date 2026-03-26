import { useEffect } from 'react';
import { usePlayerStore, currentTimeRef } from '@/stores/usePlayerStore';
import { useAppStore, type AppView } from '@/stores/useAppStore';

const NAV_VIEWS: AppView[] = [
  'library',
  'playlists',
  'favorites',
  'history',
  'search',
  'radio',
  'settings',
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
              useAppStore.getState().toggleRightPanel('lyrics');
              return;
            }
            break;
          }
          case 'q':
          case 'Q': {
            if (!e.shiftKey) {
              e.preventDefault();
              useAppStore.getState().toggleRightPanel('queue');
              return;
            }
            break;
          }
          case 'M':
          case 'm': {
            if (e.shiftKey) {
              e.preventDefault();
              useAppStore.getState().toggleCompactMode();
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
        usePlayerStore.getState().togglePlay();
        return;
      }

      if (guarded) return;

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 5;
          const currentTime = currentTimeRef.current;
          const { duration, seek } = usePlayerStore.getState();
          seek(Math.min(currentTime + step, duration));
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 5;
          const currentTime = currentTimeRef.current;
          const { seek } = usePlayerStore.getState();
          seek(Math.max(currentTime - step, 0));
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const { volume, setVolume } = usePlayerStore.getState();
          setVolume(Math.min(volume + 0.05, 1));
          return;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const { volume, setVolume } = usePlayerStore.getState();
          setVolume(Math.max(volume - 0.05, 0));
          return;
        }
        case 'M':
        case 'm': {
          e.preventDefault();
          usePlayerStore.getState().toggleMute();
          return;
        }
        case 'N':
        case 'n': {
          e.preventDefault();
          usePlayerStore.getState().next();
          return;
        }
        case 'P':
        case 'p': {
          e.preventDefault();
          usePlayerStore.getState().previous();
          return;
        }
        case 'S':
        case 's': {
          e.preventDefault();
          usePlayerStore.getState().toggleShuffle();
          return;
        }
        case 'R':
        case 'r': {
          e.preventDefault();
          usePlayerStore.getState().cycleRepeatMode();
          return;
        }
        case 'L':
        case 'l': {
          e.preventDefault();
          const { currentTrack, toggleFavorite } = usePlayerStore.getState();
          if (currentTrack) toggleFavorite(currentTrack.id);
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
          const { rightPanel, setRightPanel } = useAppStore.getState();
          if (rightPanel !== null) {
            e.preventDefault();
            setRightPanel(null);
          }
          return;
        }
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7': {
          e.preventDefault();
          const view = NAV_VIEWS[parseInt(e.key) - 1];
          useAppStore.getState().navigateTo(view);
          return;
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
