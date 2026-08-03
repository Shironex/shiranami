import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NAV_VIEWS } from '@/hooks/useKeyboardShortcuts';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import type {
  IKeyboardShortcutsHelpView,
  IShortcutCategories,
} from './KeyboardShortcutsHelp.types';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const MOD = isMac ? '⌘' : 'Ctrl';

function getShortcutCategories(): IShortcutCategories {
  return {
    playback: {
      titleKey: 'playback',
      glyph: '01',
      shortcuts: [
        { keys: ['Space'], actionKey: 'playPause' },
        { keys: ['N'], actionKey: 'nextTrack' },
        { keys: ['P'], actionKey: 'previousTrack' },
        { keys: ['←'], actionKey: 'seekBack5s' },
        { keys: ['→'], actionKey: 'seekForward5s' },
        { keys: ['Shift', '←'], actionKey: 'seekBack10s' },
        { keys: ['Shift', '→'], actionKey: 'seekForward10s' },
        { keys: ['↑'], actionKey: 'volumeUp' },
        { keys: ['↓'], actionKey: 'volumeDown' },
        { keys: ['M'], actionKey: 'muteUnmute' },
        { keys: ['S'], actionKey: 'toggleShuffle' },
        { keys: ['R'], actionKey: 'cycleRepeat' },
        { keys: ['L'], actionKey: 'favoriteTrack' },
      ],
    },
    navigation: {
      titleKey: 'navigation',
      glyph: '02',
      // Numeric nav entries are derived from NAV_VIEWS so the help dialog
      // can never drift out of sync with the keyboard handler again.
      shortcuts: [
        ...NAV_VIEWS.map((entry, i) => ({
          keys: [String(i + 1)],
          actionKey: entry.labelKey,
        })),
        { keys: [MOD, 'K'], actionKey: 'commandPalette' },
      ],
    },
    panelsUi: {
      titleKey: 'panelsUi',
      glyph: '03',
      shortcuts: [
        { keys: [MOD, 'B'], actionKey: 'toggleSidebar' },
        { keys: [MOD, 'L'], actionKey: 'toggleLyrics' },
        { keys: [MOD, 'Q'], actionKey: 'toggleQueue' },
        { keys: [MOD, 'Shift', 'M'], actionKey: 'compactMode' },
        { keys: [MOD, 'Shift', 'T'], actionKey: 'toggleAlwaysOnTop' },
        { keys: [MOD, 'Shift', 'P'], actionKey: 'toggleNowPlaying' },
        { keys: ['V'], actionKey: 'toggleVisualizer' },
        { keys: ['F'], actionKey: 'toggleSanctuary' },
        { keys: ['?'], actionKey: 'showHelp' },
        { keys: ['Esc'], actionKey: 'closePanel' },
      ],
    },
  };
}

export function useKeyboardShortcutsHelp(): IKeyboardShortcutsHelpView {
  const { t } = useTranslation('shortcuts');
  const [open, setOpen] = useState(false);
  const categories = useMemo(() => getShortcutCategories(), []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(DIALOG_EVENTS.openShortcutHelp, handler);
    return () => window.removeEventListener(DIALOG_EVENTS.openShortcutHelp, handler);
  }, []);

  return { t, open, setOpen, categories };
}
