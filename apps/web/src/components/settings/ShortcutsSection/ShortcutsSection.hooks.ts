import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_KEYMAP,
  chordFromEvent,
  findBindingConflict,
  formatBinding,
  isBindableEvent,
  type BindingConflict,
  type KeyBinding,
  type ShortcutActionId,
} from '@/lib/keymap';
import { useKeymapStore } from '@/stores/useKeymapStore';
import type {
  IConflictNotice,
  IShortcutGroups,
  IShortcutRow,
  IShortcutsSectionView,
} from './ShortcutsSection.types';

/** Display groups, mirroring the shortcuts help dialog's categories. */
const GROUP_ACTIONS: Record<keyof IShortcutGroups, ShortcutActionId[]> = {
  playback: [
    'playPause',
    'nextTrack',
    'previousTrack',
    'seekBack',
    'seekForward',
    'volumeUp',
    'volumeDown',
    'muteUnmute',
    'toggleShuffle',
    'cycleRepeat',
    'favoriteTrack',
  ],
  panelsUi: [
    'toggleSidebar',
    'toggleLyrics',
    'toggleQueue',
    'compactMode',
    'toggleAlwaysOnTop',
    'toggleNowPlaying',
    'toggleVisualizer',
    'toggleSanctuary',
    'showHelp',
  ],
};

interface IRejectedCapture {
  actionId: ShortcutActionId;
  conflict: BindingConflict;
}

export function useShortcutsSection(): IShortcutsSectionView {
  const { t } = useTranslation('shortcuts');
  const bindings = useKeymapStore(s => s.bindings);
  const overrides = useKeymapStore(s => s.overrides);
  const setBinding = useKeymapStore(s => s.setBinding);
  const resetBinding = useKeymapStore(s => s.resetBinding);
  const resetAllBindings = useKeymapStore(s => s.resetAllBindings);

  const [capturingId, setCapturingId] = useState<ShortcutActionId | null>(null);
  const [rejected, setRejected] = useState<IRejectedCapture | null>(null);

  // While a row is capturing, swallow every keydown before the app's own
  // shortcut handlers see it (window capture phase + stopImmediatePropagation
  // — the global handlers listen on window's bubble phase).
  useEffect(() => {
    if (!capturingId) return;
    const actionId = capturingId;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === 'Escape') {
        setCapturingId(null);
        setRejected(null);
        return;
      }
      // A bare modifier press is the start of a chord — keep waiting.
      if (!isBindableEvent(e)) return;
      // Alt chords are unsupported (see the keymap module doc) — keep waiting.
      if (e.altKey) return;

      const chord: KeyBinding = chordFromEvent(e);
      const conflict = findBindingConflict(chord, actionId, useKeymapStore.getState().bindings);
      if (conflict) {
        setRejected({ actionId, conflict });
        return;
      }
      setBinding(actionId, chord);
      setCapturingId(null);
      setRejected(null);
    }

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [capturingId, setBinding]);

  const onToggleCapture = useCallback((id: ShortcutActionId) => {
    setRejected(null);
    setCapturingId(prev => (prev === id ? null : id));
  }, []);

  const onResetBinding = useCallback(
    (id: ShortcutActionId) => {
      setRejected(null);
      setCapturingId(null);
      resetBinding(id);
    },
    [resetBinding]
  );

  const onResetAll = useCallback(() => {
    setRejected(null);
    setCapturingId(null);
    resetAllBindings();
  }, [resetAllBindings]);

  const toRow = (id: ShortcutActionId): IShortcutRow => {
    const label = t(id);
    const keys = formatBinding(bindings[id]);
    const capturing = capturingId === id;
    return {
      id,
      label,
      keys,
      modified: id in overrides,
      capturing,
      bindingAria: capturing
        ? t('rebind.captureAria', { action: label })
        : t('rebind.bindingAria', { action: label, keys: keys.join(' + ') }),
      resetAria: t('rebind.resetBindingAria', {
        action: label,
        keys: formatBinding(DEFAULT_KEYMAP[id]).join(' + '),
      }),
    };
  };

  const groups: IShortcutGroups = {
    playback: { title: t('playback'), rows: GROUP_ACTIONS.playback.map(toRow) },
    panelsUi: { title: t('panelsUi'), rows: GROUP_ACTIONS.panelsUi.map(toRow) },
  };

  let conflict: IConflictNotice | null = null;
  if (rejected) {
    const message =
      rejected.conflict.type === 'action'
        ? t('rebind.conflictAction', { action: t(rejected.conflict.actionId) })
        : rejected.conflict.reservedKind === 'navigation'
          ? t('rebind.reservedNavigation')
          : t('rebind.reservedSystem');
    conflict = { actionId: rejected.actionId, message };
  }

  return {
    t,
    groups,
    conflict,
    anyModified: Object.keys(overrides).length > 0,
    onToggleCapture,
    onResetBinding,
    onResetAll,
  };
}
