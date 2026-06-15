import { useTranslation } from 'react-i18next';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import { formatGain } from '@/lib/eqFormat';
import {
  useEqStore,
  EQ_MIN_DB,
  EQ_MAX_DB,
  PREAMP_MIN_DB,
  PREAMP_MAX_DB,
  type NamedEqPresetId,
} from '@/stores/useEqStore';
import type { IEqualizerSectionView } from './EqualizerSection.types';

const PREAMP_STEP = 0.5;

/** Slider bounds for an individual band, shared with the shell. */
export const EQ_BAND_BOUNDS = { min: EQ_MIN_DB, max: EQ_MAX_DB, step: 0.5 } as const;

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

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function formatBandLabel(t: TFn, freq: number): string {
  if (freq >= 1000) return t('bandLabelKhz', { freq: freq / 1000 });
  return t('bandLabel', { freq });
}

export function useEqualizerSection(): IEqualizerSectionView {
  const { t } = useTranslation('equalizer');

  const enabled = useEqStore(s => s.enabled);
  const preset = useEqStore(s => s.preset);
  const gains = useEqStore(s => s.gains);
  const preampDb = useEqStore(s => s.preampDb);
  const setEnabled = useEqStore(s => s.setEnabled);
  const setBandGain = useEqStore(s => s.setBandGain);
  const setPreampDb = useEqStore(s => s.setPreampDb);
  const applyPreset = useEqStore(s => s.applyPreset);
  const reset = useEqStore(s => s.reset);

  const presetTiles = ORDERED_PRESETS.map(id => ({
    id,
    label: t(`preset.${id}`),
    selected: preset === id,
  }));

  const bands = EQ_BANDS.map((freq, index) => ({
    freq,
    index,
    value: gains[index] ?? 0,
    label: formatBandLabel(t, freq),
    bandName: t(`bandName.${freq}`),
    gainLabel: t('gainLabel', { gain: formatGain(gains[index] ?? 0) }),
  }));

  return {
    title: t('title'),
    subtitle: t('subtitle'),

    enabled,
    onSetEnabled: setEnabled,
    enableLabel: t('enable'),
    enableDescription: t('enableDesc'),

    presetLabel: t('preset'),
    presetTiles,
    isCustomPreset: preset === 'custom',
    customPresetLabel: t('customPreset'),
    onApplyPreset: applyPreset,

    curvePreviewTitle: t('curvePreview.title'),
    gains,
    preampDb,

    bands,
    bassZoneLabel: t('zone.bass'),
    midsZoneLabel: t('zone.mids'),
    trebleZoneLabel: t('zone.treble'),
    onSetBandGain: setBandGain,

    preampLabel: t('preamp'),
    preampDescription: t('preampDesc'),
    preampGainLabel: t('gainLabel', { gain: formatGain(preampDb) }),
    preampMinLabel: t('gainLabel', { gain: PREAMP_MIN_DB }),
    preampMaxLabel: t('gainLabel', { gain: `+${PREAMP_MAX_DB}` }),
    preampMin: PREAMP_MIN_DB,
    preampMax: PREAMP_MAX_DB,
    preampStep: PREAMP_STEP,
    onSetPreampDb: setPreampDb,

    resetLabel: t('reset'),
    onReset: reset,
  };
}
