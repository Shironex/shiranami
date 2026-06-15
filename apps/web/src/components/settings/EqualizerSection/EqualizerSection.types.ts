import type { NamedEqPresetId } from '@/stores/useEqStore';

export interface IEqualizerPresetTile {
  /** Preset identifier applied on click. */
  readonly id: NamedEqPresetId;
  /** Localized preset label. */
  readonly label: string;
  /** Whether this preset is the active selection. */
  readonly selected: boolean;
}

export interface IEqualizerBand {
  /** Band centre frequency in Hz (stable list key). */
  readonly freq: number;
  /** Band index into the gains array. */
  readonly index: number;
  /** Current gain for this band in dB. */
  readonly value: number;
  /** Localized aria-label for the band slider. */
  readonly label: string;
  /** Localized band name shown in the tooltip. */
  readonly bandName: string;
  /** Localized, formatted gain shown in the tooltip. */
  readonly gainLabel: string;
}

export interface IEqualizerSectionView {
  /** Localized card title. */
  readonly title: string;
  /** Localized card subtitle. */
  readonly subtitle: string;

  /** Whether the equalizer is enabled. */
  readonly enabled: boolean;
  /** Toggle the equalizer on/off. */
  readonly onSetEnabled: (next: boolean) => void;
  /** Localized "enable" row label. */
  readonly enableLabel: string;
  /** Localized "enable" row description. */
  readonly enableDescription: string;

  /** Localized "Presets" group label. */
  readonly presetLabel: string;
  /** Named preset tiles to render. */
  readonly presetTiles: readonly IEqualizerPresetTile[];
  /** Whether a custom (non-named) curve is active. */
  readonly isCustomPreset: boolean;
  /** Localized "Custom" preset label. */
  readonly customPresetLabel: string;
  /** Apply a named preset by id. */
  readonly onApplyPreset: (id: NamedEqPresetId) => void;

  /** Localized response-curve preview title. */
  readonly curvePreviewTitle: string;
  /** Current per-band gains feeding the curve preview. */
  readonly gains: number[];
  /** Current preamp gain in dB feeding the curve preview. */
  readonly preampDb: number;

  /** Bands rendered in the band strip. */
  readonly bands: readonly IEqualizerBand[];
  /** Localized bass zone label. */
  readonly bassZoneLabel: string;
  /** Localized mids zone label. */
  readonly midsZoneLabel: string;
  /** Localized treble zone label. */
  readonly trebleZoneLabel: string;
  /** Set a band's gain by index. */
  readonly onSetBandGain: (index: number, db: number) => void;

  /** Localized preamp row label. */
  readonly preampLabel: string;
  /** Localized preamp row description. */
  readonly preampDescription: string;
  /** Localized, formatted current preamp gain. */
  readonly preampGainLabel: string;
  /** Localized minimum preamp tick label. */
  readonly preampMinLabel: string;
  /** Localized maximum preamp tick label. */
  readonly preampMaxLabel: string;
  /** Minimum preamp gain (slider bound). */
  readonly preampMin: number;
  /** Maximum preamp gain (slider bound). */
  readonly preampMax: number;
  /** Preamp slider step. */
  readonly preampStep: number;
  /** Set the preamp gain in dB. */
  readonly onSetPreampDb: (db: number) => void;

  /** Localized reset-button label. */
  readonly resetLabel: string;
  /** Reset all bands, preamp, and preset to defaults. */
  readonly onReset: () => void;
}
