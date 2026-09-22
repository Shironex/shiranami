import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_BACKGROUND_LIBRARY,
  backgroundUrls,
  useBackgroundLibraryQuery,
} from '@/hooks/queries/useBackgroundLibrary';
import {
  useAddBackground,
  useRemoveBackground,
  useRenameBackground,
  useSetActiveBackground,
} from '@/hooks/queries/useBackgroundLibraryMutations';
import {
  BACKGROUND_ROTATION_INTERVALS,
  BACKGROUND_SCHEDULE_SLOTS,
  BACKGROUND_SELECTION_MODES,
  useBackgroundSelectionStore,
  type BackgroundScheduleSlot,
} from '@/stores/useBackgroundSelectionStore';
import type { IBackgroundLibraryManagerView } from './BackgroundLibraryManager.types';

/**
 * The library holds at most this many entries — mirrors the backend's
 * `MAX_LIBRARY_ENTRIES` cap, pinned by a test against the wire refusal so the
 * add tile disables exactly when the backend would refuse.
 */
export const BACKGROUND_LIBRARY_CAP = 12;

/** The schedule-select sentinel for "no mapping — show the active pick". */
export const SCHEDULE_FALLBACK_VALUE = 'none';

/**
 * Owns the saved-background manager's state: the tile list with its labels
 * and thumbnails, the add/rename/remove/set-active mutations, the inline
 * rename draft, and the selection-mode controls (single / rotation /
 * time-of-day schedule). The shell only renders.
 */
export function useBackgroundLibraryManager(): IBackgroundLibraryManagerView {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data } = useBackgroundLibraryQuery();
  const library = data ?? EMPTY_BACKGROUND_LIBRARY;
  const addBackground = useAddBackground();
  const removeBackground = useRemoveBackground();
  const setActiveBackground = useSetActiveBackground();
  const renameBackground = useRenameBackground();

  const mode = useBackgroundSelectionStore(s => s.mode);
  const setMode = useBackgroundSelectionStore(s => s.setMode);
  const rotationInterval = useBackgroundSelectionStore(s => s.rotationInterval);
  const setRotationInterval = useBackgroundSelectionStore(s => s.setRotationInterval);
  const schedule = useBackgroundSelectionStore(s => s.schedule);
  const setScheduleSlot = useBackgroundSelectionStore(s => s.setScheduleSlot);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const displayLabel = (label: string): string =>
    label.trim().length > 0 ? label : t('app.background.library.unnamed');

  const tiles = library.entries.map(entry => {
    const name = displayLabel(entry.label);
    return {
      id: entry.id,
      label: name,
      thumbUrl: backgroundUrls(entry.background).url,
      isActive: entry.id === library.activeId,
      selectLabel: t('app.background.library.makeActive', { name }),
      renameLabel: t('app.background.library.rename', { name }),
      removeLabel: t('app.background.library.remove', { name }),
    };
  });

  const canAdd = library.entries.length < BACKGROUND_LIBRARY_CAP;
  const hasAlternatives = library.entries.length >= 2;

  const onCommitRename = (): void => {
    if (editingId !== null) {
      renameBackground.mutate({ id: editingId, label: editingLabel });
    }
    setEditingId(null);
  };

  return {
    tiles,
    onSelectTile: id => setActiveBackground.mutate(id),
    onRemoveTile: id => {
      if (editingId === id) setEditingId(null);
      removeBackground.mutate(id);
    },

    addLabel: t('app.background.library.add'),
    onAdd: () => {
      if (!canAdd || addBackground.isPending) return;
      addBackground.mutate(
        t('app.background.library.defaultLabel', { n: library.entries.length + 1 })
      );
    },
    isAdding: addBackground.isPending,
    canAdd,
    hint: t('app.background.hint'),
    fullHint: canAdd ? null : t('app.background.library.full'),

    editingId,
    editingLabel,
    onStartRename: id => {
      const entry = library.entries.find(candidate => candidate.id === id);
      setEditingId(id);
      setEditingLabel(entry?.label ?? '');
    },
    onEditingLabelChange: setEditingLabel,
    onCommitRename,
    onCancelRename: () => setEditingId(null),
    saveLabel: tc('save'),
    cancelLabel: tc('cancel'),

    showModeControls: hasAlternatives,
    modeTitle: t('app.background.library.modeTitle'),
    modeDescription: t('app.background.library.modeDesc'),
    modeOptions: BACKGROUND_SELECTION_MODES.map(value => ({
      value,
      label: t(`app.background.library.modes.${value}`),
      isActive: mode === value,
    })),
    onSelectMode: setMode,

    showIntervalControls: hasAlternatives && mode === 'rotation',
    intervalTitle: t('app.background.library.intervalTitle'),
    intervalDescription: t('app.background.library.intervalDesc'),
    intervalOptions: BACKGROUND_ROTATION_INTERVALS.map(value => ({
      value,
      label: t(`app.background.library.intervals.${value}`),
      isActive: rotationInterval === value,
    })),
    onSelectInterval: setRotationInterval,

    showScheduleControls: hasAlternatives && mode === 'timeOfDay',
    scheduleTitle: t('app.background.library.scheduleTitle'),
    scheduleDescription: t('app.background.library.scheduleDesc'),
    // Slot names reuse the room-light stop labels on purpose: both features
    // read the same clock through the same stops, and two names for one hour
    // range would read as two different clocks.
    scheduleRows: BACKGROUND_SCHEDULE_SLOTS.map(slot => ({
      slot,
      label: t(`app.roomLightStops.${slot}`),
      value: schedule[slot] ?? SCHEDULE_FALLBACK_VALUE,
    })),
    scheduleOptions: [
      { value: SCHEDULE_FALLBACK_VALUE, label: t('app.background.library.scheduleFallback') },
      ...library.entries.map(entry => ({ value: entry.id, label: displayLabel(entry.label) })),
    ],
    onSetScheduleSlot: (slot: BackgroundScheduleSlot, value: string) =>
      setScheduleSlot(slot, value === SCHEDULE_FALLBACK_VALUE ? null : value),
  };
}
