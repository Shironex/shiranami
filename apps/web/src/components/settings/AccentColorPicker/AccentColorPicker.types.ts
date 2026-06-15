import type { RefObject } from 'react';

/** One rendered preset swatch, pre-resolved with its localized name + active flag. */
export interface IAccentSwatch {
  /** Hex value applied as the swatch background and persisted on click. */
  readonly hex: string;
  /** Localized preset name (tooltip + aria). */
  readonly name: string;
  /** Whether this preset is the active accent. */
  readonly isActive: boolean;
}

export interface IAccentColorPickerView {
  /** Localized radiogroup label for the picker. */
  readonly groupLabel: string;
  /** Localized "auto" (follow theme) label. */
  readonly autoLabel: string;
  /** Localized "custom color" label. */
  readonly customLabel: string;
  /** The active accent hex, or null when following the theme ("auto"). */
  readonly accentColor: string | null;
  /** Whether "auto" is the active selection. */
  readonly isAuto: boolean;
  /** Whether a free custom color (non-preset, non-auto) is active. */
  readonly isCustom: boolean;
  /** Preset swatches, pre-resolved with localized names + active flags. */
  readonly swatches: readonly IAccentSwatch[];
  /** Value bound to the native color input (custom accent or a neutral default). */
  readonly customInputValue: string;
  /** Ref for the hidden native color input, clicked to open the OS color dialog. */
  readonly customInputRef: RefObject<HTMLInputElement | null>;
  /** Localized aria-label for applying a named preset. */
  readonly applyLabel: (name: string) => string;
  /** Select "auto" (follow the active theme's accent). */
  readonly onSelectAuto: () => void;
  /** Apply a preset/custom hex. */
  readonly onSelectColor: (hex: string) => void;
  /** Open the native color dialog. */
  readonly onOpenCustom: () => void;
}
