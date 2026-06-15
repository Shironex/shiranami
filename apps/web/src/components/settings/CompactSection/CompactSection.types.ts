import type { useTranslation } from 'react-i18next';
import type { CompactSize, CompactFontSize } from '@/stores/useCompactStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One preset chip in a size/font-size control. */
export interface ICompactPresetOption<T extends string> {
  /** Persisted preset value. */
  readonly value: T;
  /** Localized chip label. */
  readonly label: string;
  /** Whether this preset is the active one. */
  readonly isActive: boolean;
}

/** A size-or-font-size preset control, pre-resolved. */
export interface ICompactPresetControl<T extends string> {
  /** Localized control title. */
  readonly title: string;
  /** Localized control description. */
  readonly description: string;
  /** Selectable preset options. */
  readonly options: readonly ICompactPresetOption<T>[];
}

/** The ambient-intensity slider control, pre-resolved. */
export interface ICompactAmbientControl {
  /** Localized control title. */
  readonly title: string;
  /** Localized control description. */
  readonly description: string;
  /** Current intensity value. */
  readonly value: number;
  /** Current intensity as a 0–100 percentage. */
  readonly percent: number;
  /** Slider min. */
  readonly min: number;
  /** Slider max. */
  readonly max: number;
  /** Slider step. */
  readonly step: number;
}

/** One element-visibility toggle row, pre-resolved. */
export interface ICompactToggle {
  /** Stable key (for React lists). */
  readonly key: string;
  /** Localized row label. */
  readonly label: string;
  /** Localized row description. */
  readonly description: string;
  /** Current on/off value. */
  readonly checked: boolean;
  /** Set the value. */
  readonly onChange: (checked: boolean) => void;
  /** Whether to render the top divider (every row except the first). */
  readonly divider: boolean;
}

export interface ICompactSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Localized "reset" label (from the `common` namespace). */
  readonly resetLabel: string;
  /** Whether any compact setting differs from default (shows the reset link). */
  readonly isModified: boolean;
  /** Reset compact appearance to defaults. */
  readonly onReset: () => void;

  // --- Size + typography ---
  /** Window-size preset control. */
  readonly sizeControl: ICompactPresetControl<CompactSize>;
  /** Set the window size. */
  readonly onSetSize: (value: CompactSize) => void;
  /** Text-size preset control. */
  readonly fontSizeControl: ICompactPresetControl<CompactFontSize>;
  /** Set the text size. */
  readonly onSetFontSize: (value: CompactFontSize) => void;
  /** Ambient-intensity slider control. */
  readonly ambientControl: ICompactAmbientControl;
  /** Set the ambient intensity. */
  readonly onSetAmbientIntensity: (value: number) => void;

  // --- Element visibility ---
  /** Element-visibility toggle rows. */
  readonly elementToggles: readonly ICompactToggle[];

  // --- Behavior ---
  /** Default always-on-top toggle. */
  readonly behaviorToggle: ICompactToggle;
}
