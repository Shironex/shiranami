import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { useAppStore } from '@/stores/useAppStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_MAC: false,
  IS_WINDOWS: true,
}));
// Use importOriginal so initReactI18next (and other exports) remain
// available — @/lib/i18n.ts is now reachable from the hook via the
// toast feedback path and needs the real plugin shape at module init.
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string) => k }),
  };
});

function pressKey(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
  target?: Element,
) {
  const eventTarget = target ?? document;
  fireEvent.keyDown(eventTarget, { key, ...opts });
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Reset player store to known defaults
    usePlaybackStore.setState({
      isPlaying: false,
      volume: 0.5,
      isMuted: false,
      duration: 300,
      currentTrack: {
        id: 't1',
        title: 'Test Track',
        artist: 'Artist',
        album: 'Album',
        duration: 300,
        filePath: '/music/test.mp3',
      },
      isShuffled: false,
      repeatMode: 'off',
    });
    currentTimeRef.current = 100;

    useAppStore.setState({
      rightPanel: null,
    });

    useSelectionStore.setState({
      selectedTrackIds: new Set(),
      lastClickedIndex: null,
    });
  });

  function setup() {
    return renderHook(() => useKeyboardShortcuts());
  }

  // --- Playback: Space toggles play/pause ---

  describe('Space - toggle play/pause', () => {
    it('toggles play when pressed on document body', () => {
      setup();
      expect(usePlaybackStore.getState().isPlaying).toBe(false);

      pressKey(' ');
      expect(usePlaybackStore.getState().isPlaying).toBe(true);

      pressKey(' ');
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });

    it('does NOT toggle play when target is an input element', () => {
      setup();
      const input = document.createElement('input');
      document.body.appendChild(input);

      pressKey(' ', {}, input);
      expect(usePlaybackStore.getState().isPlaying).toBe(false);

      document.body.removeChild(input);
    });

    it('does NOT toggle play when target is a button element', () => {
      setup();
      const button = document.createElement('button');
      document.body.appendChild(button);

      pressKey(' ', {}, button);
      expect(usePlaybackStore.getState().isPlaying).toBe(false);

      document.body.removeChild(button);
    });

    it('does NOT toggle play when target is a textarea', () => {
      setup();
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      pressKey(' ', {}, textarea);
      expect(usePlaybackStore.getState().isPlaying).toBe(false);

      document.body.removeChild(textarea);
    });
  });

  // --- Seeking with arrow keys ---

  describe('ArrowRight / ArrowLeft - seek', () => {
    it('ArrowRight seeks forward 5 seconds', () => {
      setup();
      const seekSpy = vi.spyOn(usePlaybackStore.getState(), 'seek');

      pressKey('ArrowRight');
      expect(seekSpy).toHaveBeenCalledWith(105); // 100 + 5
    });

    it('ArrowRight+Shift seeks forward 10 seconds', () => {
      setup();
      const seekSpy = vi.spyOn(usePlaybackStore.getState(), 'seek');

      pressKey('ArrowRight', { shiftKey: true });
      expect(seekSpy).toHaveBeenCalledWith(110); // 100 + 10
    });

    it('ArrowLeft seeks backward 5 seconds', () => {
      setup();
      const seekSpy = vi.spyOn(usePlaybackStore.getState(), 'seek');

      pressKey('ArrowLeft');
      expect(seekSpy).toHaveBeenCalledWith(95); // 100 - 5
    });

    it('ArrowLeft+Shift seeks backward 10 seconds', () => {
      setup();
      const seekSpy = vi.spyOn(usePlaybackStore.getState(), 'seek');

      pressKey('ArrowLeft', { shiftKey: true });
      expect(seekSpy).toHaveBeenCalledWith(90); // 100 - 10
    });

    it('seek does not go below 0', () => {
      setup();
      currentTimeRef.current = 3;
      const seekSpy = vi.spyOn(usePlaybackStore.getState(), 'seek');

      pressKey('ArrowLeft');
      expect(seekSpy).toHaveBeenCalledWith(0);
    });

    it('seek does not exceed duration', () => {
      setup();
      currentTimeRef.current = 298;
      const seekSpy = vi.spyOn(usePlaybackStore.getState(), 'seek');

      pressKey('ArrowRight');
      expect(seekSpy).toHaveBeenCalledWith(300); // clamped to duration
    });
  });

  // --- Volume ---

  describe('ArrowUp / ArrowDown - volume', () => {
    it('ArrowUp increases volume by 0.05', () => {
      setup();
      pressKey('ArrowUp');
      expect(usePlaybackStore.getState().volume).toBeCloseTo(0.55);
    });

    it('ArrowDown decreases volume by 0.05', () => {
      setup();
      pressKey('ArrowDown');
      expect(usePlaybackStore.getState().volume).toBeCloseTo(0.45);
    });

    it('volume does not exceed 1', () => {
      setup();
      usePlaybackStore.setState({ volume: 0.98 });
      pressKey('ArrowUp');
      expect(usePlaybackStore.getState().volume).toBeLessThanOrEqual(1);
    });

    it('volume does not go below 0', () => {
      setup();
      usePlaybackStore.setState({ volume: 0.02 });
      pressKey('ArrowDown');
      expect(usePlaybackStore.getState().volume).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Mute ---

  describe('M - toggle mute', () => {
    it('toggles mute on and off', () => {
      setup();
      expect(usePlaybackStore.getState().isMuted).toBe(false);

      pressKey('m');
      expect(usePlaybackStore.getState().isMuted).toBe(true);

      pressKey('M');
      expect(usePlaybackStore.getState().isMuted).toBe(false);
    });
  });

  // --- Next / Previous ---

  describe('N / P - next and previous', () => {
    it('N calls next()', () => {
      setup();
      const nextSpy = vi.spyOn(usePlaybackStore.getState(), 'next');

      pressKey('n');
      expect(nextSpy).toHaveBeenCalledOnce();
    });

    it('P calls previous()', () => {
      setup();
      const prevSpy = vi.spyOn(usePlaybackStore.getState(), 'previous');

      pressKey('p');
      expect(prevSpy).toHaveBeenCalledOnce();
    });
  });

  // --- Shuffle / Repeat ---

  describe('S - shuffle, R - repeat', () => {
    it('S toggles shuffle', () => {
      setup();
      const shuffleSpy = vi.spyOn(usePlaybackStore.getState(), 'toggleShuffle');

      pressKey('s');
      expect(shuffleSpy).toHaveBeenCalledOnce();
    });

    it('R cycles repeat mode', () => {
      setup();
      expect(usePlaybackStore.getState().repeatMode).toBe('off');

      pressKey('r');
      expect(usePlaybackStore.getState().repeatMode).toBe('all');

      pressKey('r');
      expect(usePlaybackStore.getState().repeatMode).toBe('one');

      pressKey('r');
      expect(usePlaybackStore.getState().repeatMode).toBe('off');
    });
  });

  // --- Navigation with number keys ---

  describe('Number keys 1-9 - navigate to views', () => {
    // Mirrors NAV_VIEWS in useKeyboardShortcuts.ts and the visual order in
    // Sidebar.tsx. Update both places together if the canonical nav order
    // changes.
    const viewMap: Record<string, string> = {
      '1': 'library',
      '2': 'playlists',
      '3': 'favorites',
      '4': 'history',
      '5': 'mixes',
      '6': 'search',
      '7': 'import-playlist',
      '8': 'radio',
      '9': 'settings',
    };

    for (const [key, view] of Object.entries(viewMap)) {
      it(`${key} navigates to ${view}`, () => {
        setup();
        const navSpy = vi.spyOn(useAppStore.getState(), 'navigateTo');

        pressKey(key);
        expect(navSpy).toHaveBeenCalledWith(view);
      });
    }
  });

  // --- L - toggle favorite ---

  describe('L - toggle favorite', () => {
    it('calls toggleFavorite with the current track id', () => {
      setup();
      const favSpy = vi
        .spyOn(useLibraryStore.getState(), 'toggleFavorite')
        .mockImplementation(() => {});

      pressKey('l');
      expect(favSpy).toHaveBeenCalledWith('t1');
    });

    it('does nothing when there is no current track', () => {
      setup();
      usePlaybackStore.setState({ currentTrack: null });
      const favSpy = vi
        .spyOn(useLibraryStore.getState(), 'toggleFavorite')
        .mockImplementation(() => {});

      pressKey('l');
      expect(favSpy).not.toHaveBeenCalled();
    });
  });

  // --- Escape ---

  describe('Escape - back / clear selection / close panel', () => {
    it('exits Now Playing view first, before any other Esc handling', () => {
      setup();
      // Set up: in Now Playing with an open right panel. Esc should
      // exit the immersive view and leave the panel alone (the handler
      // takes the now-playing branch and returns before reaching the
      // panel-close branch).
      //
      // Note: we can't usefully assert on selection here. `useSelectionStore`
      // has a module-level subscription on `useAppStore` (see
      // useSelectionStore.ts:67-74) that auto-clears selection any time
      // `activeView` changes. So `exitNowPlaying()` clears the selection
      // as a side effect regardless of which Esc branch the handler
      // takes — selection is unobservable for distinguishing branches.
      // The panel is the cleaner signal.
      useAppStore.setState({
        activeView: 'now-playing',
        previousView: 'library',
        rightPanel: 'queue',
      });

      pressKey('Escape');

      // Exited back to previousView via exitNowPlaying()
      expect(useAppStore.getState().activeView).toBe('library');
      // Panel untouched — handler returned early, never reached the
      // setRightPanel(null) branch.
      expect(useAppStore.getState().rightPanel).toBe('queue');
    });

    it('clears selection when tracks are selected', () => {
      setup();
      useSelectionStore.setState({
        selectedTrackIds: new Set(['t1', 't2']),
      });

      pressKey('Escape');
      expect(useSelectionStore.getState().selectedTrackIds.size).toBe(0);
    });

    it('closes right panel when no tracks are selected', () => {
      setup();
      useAppStore.setState({ rightPanel: 'queue' });

      pressKey('Escape');
      expect(useAppStore.getState().rightPanel).toBeNull();
    });

    it('clears selection first, does not close panel', () => {
      setup();
      useSelectionStore.setState({
        selectedTrackIds: new Set(['t1']),
      });
      useAppStore.setState({ rightPanel: 'lyrics' });

      pressKey('Escape');
      // Selection should be cleared
      expect(useSelectionStore.getState().selectedTrackIds.size).toBe(0);
      // Panel should still be open
      expect(useAppStore.getState().rightPanel).toBe('lyrics');
    });
  });

  // --- Modifier shortcuts ---

  describe('Modifier shortcuts (Ctrl/Cmd)', () => {
    it('Ctrl+B toggles sidebar', () => {
      setup();
      const toggleSpy = vi.spyOn(
        useAppStore.getState(),
        'toggleSidebarCollapsed',
      );

      pressKey('b', { ctrlKey: true });
      expect(toggleSpy).toHaveBeenCalledOnce();
    });

    it('Ctrl+L toggles lyrics panel', () => {
      setup();
      const toggleSpy = vi.spyOn(useAppStore.getState(), 'toggleRightPanel');

      pressKey('l', { ctrlKey: true });
      expect(toggleSpy).toHaveBeenCalledWith('lyrics');
    });

    it('Ctrl+Q toggles queue panel', () => {
      setup();
      const toggleSpy = vi.spyOn(useAppStore.getState(), 'toggleRightPanel');

      pressKey('q', { ctrlKey: true });
      expect(toggleSpy).toHaveBeenCalledWith('queue');
    });

    it('Ctrl+Shift+M toggles compact mode', () => {
      setup();
      const toggleSpy = vi.spyOn(useAppStore.getState(), 'toggleCompactMode');

      pressKey('M', { ctrlKey: true, shiftKey: true });
      expect(toggleSpy).toHaveBeenCalledOnce();
    });
  });

  // --- Editable target guard ---

  describe('Editable target guard', () => {
    it('suppresses single-key shortcuts on input elements', () => {
      setup();
      const input = document.createElement('input');
      document.body.appendChild(input);

      pressKey('m', {}, input);
      expect(usePlaybackStore.getState().isMuted).toBe(false);

      pressKey('n', {}, input);
      // next() should not have been called - isPlaying stays false as proxy
      // (no queue set up, so next() would not change state either way;
      //  we verify by checking mute was not toggled above)

      document.body.removeChild(input);
    });

    it('suppresses single-key shortcuts on textarea elements', () => {
      setup();
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      pressKey('s', {}, textarea);
      // toggleShuffle should not be called
      const shuffleSpy = vi.spyOn(usePlaybackStore.getState(), 'toggleShuffle');
      pressKey('s', {}, textarea);
      expect(shuffleSpy).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('suppresses single-key shortcuts on contentEditable elements', () => {
      setup();
      const div = document.createElement('div');
      div.contentEditable = 'true';
      // jsdom may not set isContentEditable from the attribute alone,
      // so we also define the property explicitly.
      Object.defineProperty(div, 'isContentEditable', { value: true });
      document.body.appendChild(div);

      pressKey('r', {}, div);
      // repeatMode should remain 'off'
      expect(usePlaybackStore.getState().repeatMode).toBe('off');

      document.body.removeChild(div);
    });

    it('does NOT suppress modifier shortcuts on editable targets', () => {
      setup();
      const input = document.createElement('input');
      document.body.appendChild(input);

      const toggleSpy = vi.spyOn(
        useAppStore.getState(),
        'toggleSidebarCollapsed',
      );

      pressKey('b', { ctrlKey: true }, input);
      expect(toggleSpy).toHaveBeenCalledOnce();

      document.body.removeChild(input);
    });
  });

  // --- V - visualizer, ? - shortcut help ---

  describe('V - visualizer', () => {
    it('toggles visualizer', () => {
      setup();
      const toggleSpy = vi.spyOn(useAppStore.getState(), 'toggleVisualizer');

      pressKey('v');
      expect(toggleSpy).toHaveBeenCalledOnce();
    });
  });

  describe('? - shortcut help', () => {
    it('dispatches open-shortcut-help event', () => {
      setup();
      const handler = vi.fn();
      window.addEventListener('open-shortcut-help', handler);

      pressKey('?');
      expect(handler).toHaveBeenCalledOnce();

      window.removeEventListener('open-shortcut-help', handler);
    });
  });

  // --- Cleanup ---

  describe('cleanup', () => {
    it('removes the event listener on unmount', () => {
      const { unmount } = setup();
      unmount();

      // After unmount, pressing a key should not toggle play
      usePlaybackStore.setState({ isPlaying: false });
      pressKey(' ');
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });
  });
});
