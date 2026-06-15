import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import { formatGain } from '@/lib/eqFormat';
import {
  useEqStore,
  PREAMP_MIN_DB,
  PREAMP_MAX_DB,
  EQ_PRESET_NAME_MAX,
  type EqPresetId,
  type NamedEqPresetId,
} from '@/stores/useEqStore';
import type {
  IEqualizerPanelProps,
  IEqualizerPanelView,
  IEqBandRow,
  IEqDeleteTarget,
  IEqNameDialog,
  IEqPresetOption,
} from './EqualizerPanel.types';

const PREAMP_STEP = 0.5;

const ORDERED_PRESETS: NamedEqPresetId[] = [
  'flat',
  'rock',
  'pop',
  'jazz',
  'classical',
  'electronic',
  'dance',
  'hiphop',
  'acoustic',
  'vocal',
  'bassboost',
  'trebleboost',
  'loudness',
];

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function formatBandLabel(t: Translate, freq: number): string {
  if (freq >= 1000) {
    return t('bandLabelKhz', { freq: freq / 1000 });
  }
  return t('bandLabel', { freq });
}

export function useEqualizerPanel(props: IEqualizerPanelProps = {}): IEqualizerPanelView {
  const { layout = 'popover', inline = false } = props;
  const { t } = useTranslation('equalizer');
  const { t: tPlayer } = useTranslation('player');
  const [open, setOpen] = useState(false);

  const enabled = useEqStore(s => s.enabled);
  const preset = useEqStore(s => s.preset);
  const gains = useEqStore(s => s.gains);
  const preampDb = useEqStore(s => s.preampDb);
  const customPresets = useEqStore(s => s.customPresets);
  const activeCustomId = useEqStore(s => s.activeCustomId);
  const setEnabled = useEqStore(s => s.setEnabled);
  const setBandGain = useEqStore(s => s.setBandGain);
  const setPreampDb = useEqStore(s => s.setPreampDb);
  const applyPreset = useEqStore(s => s.applyPreset);
  const applyCustomPreset = useEqStore(s => s.applyCustomPreset);
  const saveCustomPreset = useEqStore(s => s.saveCustomPreset);
  const renameCustomPreset = useEqStore(s => s.renameCustomPreset);
  const deleteCustomPreset = useEqStore(s => s.deleteCustomPreset);
  const reset = useEqStore(s => s.reset);

  // Save / rename dialog state. `mode` distinguishes the two flows; `targetId`
  // is the preset being renamed (null when saving a new one).
  const [nameDialog, setNameDialog] = useState<IEqNameDialog | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IEqDeleteTarget | null>(null);

  const active = enabled && (preset !== 'flat' || activeCustomId !== null);

  const presetOptions = useMemo<IEqPresetOption[]>(
    () => ORDERED_PRESETS.map(id => ({ id, label: t(`preset.${id}`) })),
    [t]
  );

  const userPresetOptions = useMemo<IEqPresetOption[]>(
    () => customPresets.map(p => ({ id: `custom:${p.id}`, label: p.name })),
    [customPresets]
  );

  const bandRows = useMemo<IEqBandRow[]>(
    () =>
      EQ_BANDS.map((freq, i) => {
        const value = gains[i] ?? 0;
        return {
          freq,
          index: i,
          value,
          label: formatBandLabel(t, freq),
          bandName: t(`bandName.${freq}`),
          gainLabel: t('gainLabel', { gain: formatGain(value) }),
        };
      }),
    [t, gains]
  );

  // Select value: a user preset takes a `custom:<id>` value so it round-trips
  // through the same handler as the built-ins.
  const selectValue = activeCustomId ? `custom:${activeCustomId}` : preset;

  const activeCustom = activeCustomId
    ? (customPresets.find(p => p.id === activeCustomId) ?? null)
    : null;

  const selectTriggerLabel = activeCustomId
    ? (activeCustom?.name ?? t('customPreset'))
    : preset === 'custom'
      ? t('customPreset')
      : t(`preset.${preset}`);

  const onPresetChange = useCallback(
    (value: string) => {
      if (value.startsWith('custom:')) {
        applyCustomPreset(value.slice('custom:'.length));
        return;
      }
      if (value === 'custom') return;
      applyPreset(value as EqPresetId);
    },
    [applyCustomPreset, applyPreset]
  );

  const onSubmitNameDialog = useCallback(() => {
    if (!nameDialog) return;
    const trimmed = nameDialog.value.trim();
    if (!trimmed) return;
    if (nameDialog.mode === 'save') {
      saveCustomPreset(trimmed);
    } else if (nameDialog.targetId) {
      renameCustomPreset(nameDialog.targetId, trimmed);
    }
    setNameDialog(null);
  }, [nameDialog, saveCustomPreset, renameCustomPreset]);

  const onOpenRenameDialog = useCallback(() => {
    setNameDialog({ mode: 'rename', targetId: activeCustomId, value: activeCustom?.name ?? '' });
  }, [activeCustomId, activeCustom]);

  const onOpenDeleteDialog = useCallback(() => {
    if (activeCustom) setDeleteTarget({ id: activeCustom.id, name: activeCustom.name });
  }, [activeCustom]);

  const onConfirmDelete = useCallback(() => {
    if (deleteTarget) deleteCustomPreset(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteCustomPreset]);

  return {
    t,
    tPlayer,
    layout,
    inline,

    enabled,
    active,
    preampDb,
    preampLabel: t('gainLabel', { gain: formatGain(preampDb) }),
    preampMin: PREAMP_MIN_DB,
    preampMax: PREAMP_MAX_DB,
    preampStep: PREAMP_STEP,
    bandHeightClass: layout === 'section' ? 'h-64' : 'h-56',

    selectValue,
    selectTriggerLabel,
    presetOptions,
    userPresetOptions,
    hasUserPresets: customPresets.length > 0,
    activeCustomId,
    nameMaxLength: EQ_PRESET_NAME_MAX,
    bandRows,

    nameDialog,
    deleteTarget,

    open,
    setOpen,

    onToggleEnabled: setEnabled,
    onBandChange: setBandGain,
    onPreampChange: setPreampDb,
    onPresetChange,
    onReset: reset,

    onOpenSaveDialog: () => setNameDialog({ mode: 'save', targetId: null, value: '' }),
    onOpenRenameDialog,
    onOpenDeleteDialog,
    onNameDraftChange: value => setNameDialog(d => (d ? { ...d, value } : d)),
    onSubmitNameDialog,
    onCloseNameDialog: () => setNameDialog(null),
    onConfirmDelete,
    onCloseDeleteDialog: () => setDeleteTarget(null),
    shouldKeepPopoverOpen: () => nameDialog !== null || deleteTarget !== null,
  };
}
