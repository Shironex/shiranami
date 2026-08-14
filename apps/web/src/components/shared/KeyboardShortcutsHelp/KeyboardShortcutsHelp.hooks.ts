import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NAV_VIEWS } from '@/hooks/useKeyboardShortcuts';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import { MOD_LABEL, formatBinding, type KeyBinding, type ShortcutActionId } from '@/lib/keymap';
import { useKeymapStore } from '@/stores/useKeymapStore';
import type {
  IKeyboardShortcutsHelpView,
  IShortcut,
  IShortcutCategories,
} from './KeyboardShortcutsHelp.types';

/**
 * The seek actions read Shift at dispatch time for the 10s step, so each gets
 * a base row plus a derived Shift row. When the user's chord itself requires
 * Shift there is no 5s variant left to show — the chord always seeks 10s.
 */
function seekRows(
  binding: KeyBinding,
  actionKey5s: string,
  actionKey10s: string
): [IShortcut, IShortcut | null] {
  if (binding.shift) {
    return [{ keys: formatBinding(binding), actionKey: actionKey10s }, null];
  }
  return [
    { keys: formatBinding(binding), actionKey: actionKey5s },
    { keys: formatBinding({ ...binding, shift: true }), actionKey: actionKey10s },
  ];
}

function getShortcutCategories(
  bindings: Record<ShortcutActionId, KeyBinding>
): IShortcutCategories {
  const keysFor = (id: ShortcutActionId) => formatBinding(bindings[id]);
  const [seekBack5s, seekBack10s] = seekRows(bindings.seekBack, 'seekBack5s', 'seekBack10s');
  const [seekForward5s, seekForward10s] = seekRows(
    bindings.seekForward,
    'seekForward5s',
    'seekForward10s'
  );

  return {
    playback: {
      titleKey: 'playback',
      glyph: '01',
      shortcuts: [
        { keys: keysFor('playPause'), actionKey: 'playPause' },
        { keys: keysFor('nextTrack'), actionKey: 'nextTrack' },
        { keys: keysFor('previousTrack'), actionKey: 'previousTrack' },
        seekBack5s,
        seekForward5s,
        ...(seekBack10s ? [seekBack10s] : []),
        ...(seekForward10s ? [seekForward10s] : []),
        { keys: keysFor('volumeUp'), actionKey: 'volumeUp' },
        { keys: keysFor('volumeDown'), actionKey: 'volumeDown' },
        { keys: keysFor('muteUnmute'), actionKey: 'muteUnmute' },
        { keys: keysFor('toggleShuffle'), actionKey: 'toggleShuffle' },
        { keys: keysFor('cycleRepeat'), actionKey: 'cycleRepeat' },
        { keys: keysFor('favoriteTrack'), actionKey: 'favoriteTrack' },
      ],
    },
    navigation: {
      titleKey: 'navigation',
      glyph: '02',
      // Numeric nav entries are derived from NAV_VIEWS so the help dialog
      // can never drift out of sync with the keyboard handler again. They
      // stay fixed keys, outside the remappable keymap — as does the
      // command palette chord (owned by CommandPalette).
      shortcuts: [
        ...NAV_VIEWS.map((entry, i) => ({
          keys: [String(i + 1)],
          actionKey: entry.labelKey,
        })),
        { keys: [MOD_LABEL, 'K'], actionKey: 'commandPalette' },
      ],
    },
    panelsUi: {
      titleKey: 'panelsUi',
      glyph: '03',
      shortcuts: [
        { keys: keysFor('toggleSidebar'), actionKey: 'toggleSidebar' },
        { keys: keysFor('toggleLyrics'), actionKey: 'toggleLyrics' },
        { keys: keysFor('toggleQueue'), actionKey: 'toggleQueue' },
        { keys: keysFor('compactMode'), actionKey: 'compactMode' },
        { keys: keysFor('toggleAlwaysOnTop'), actionKey: 'toggleAlwaysOnTop' },
        { keys: keysFor('toggleNowPlaying'), actionKey: 'toggleNowPlaying' },
        { keys: keysFor('toggleVisualizer'), actionKey: 'toggleVisualizer' },
        { keys: keysFor('toggleSanctuary'), actionKey: 'toggleSanctuary' },
        { keys: keysFor('showHelp'), actionKey: 'showHelp' },
        { keys: ['Esc'], actionKey: 'closePanel' },
      ],
    },
  };
}

export function useKeyboardShortcutsHelp(): IKeyboardShortcutsHelpView {
  const { t } = useTranslation('shortcuts');
  const [open, setOpen] = useState(false);
  const bindings = useKeymapStore(s => s.bindings);
  const categories = useMemo(() => getShortcutCategories(bindings), [bindings]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(DIALOG_EVENTS.openShortcutHelp, handler);
    return () => window.removeEventListener(DIALOG_EVENTS.openShortcutHelp, handler);
  }, []);

  return { t, open, setOpen, categories };
}
