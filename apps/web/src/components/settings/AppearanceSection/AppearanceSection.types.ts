import type { useTranslation } from 'react-i18next';
import type { ThemeId } from '@/stores/useThemeStore';
import type { ThemeBgFit } from '@/stores/useThemeBgStore';
import type { SupportedLanguage } from '@/lib/i18n';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One selectable interface-language option. */
export interface ILanguageOption {
  /** BCP-47-ish language code persisted + applied. */
  readonly code: SupportedLanguage;
  /** Human-readable language label. */
  readonly label: string;
  /** Whether this language is the active one. */
  readonly isActive: boolean;
}

/** One UI-scale preset chip. */
export interface IScalePreset {
  /** Preset scale percentage. */
  readonly value: number;
  /** Whether this preset matches the current scale. */
  readonly isActive: boolean;
}

export interface IAppearanceSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Localized "reset" label (from the `common` namespace). */
  readonly resetLabel: string;

  // --- Language ---
  /** Selectable interface-language options, pre-resolved with active flags. */
  readonly languageOptions: readonly ILanguageOption[];
  /** Change the active interface language. */
  readonly onSelectLanguage: (lang: SupportedLanguage) => void;

  // --- UI scale ---
  /** Current interface scale percentage. */
  readonly uiScale: number;
  /** Min slider value for scale. */
  readonly uiScaleMin: number;
  /** Max slider value for scale. */
  readonly uiScaleMax: number;
  /** Slider step for scale. */
  readonly uiScaleStep: number;
  /** Whether the scale differs from its default (shows the reset link). */
  readonly isScaleModified: boolean;
  /** Preset scale chips, pre-resolved with active flags. */
  readonly scalePresets: readonly IScalePreset[];
  /** Set the interface scale. */
  readonly onSetUiScale: (value: number) => void;
  /** Reset the interface scale to default. */
  readonly onResetUiScale: () => void;

  // --- Theme ---
  /** Active theme id. */
  readonly theme: ThemeId;
  /** Whether a theme background is active (controls the adjust panel). */
  readonly hasThemeBackground: boolean;
  /** Select a theme. */
  readonly onSelectTheme: (theme: ThemeId) => void;

  // --- Custom background ---
  /** Whether the "your own image" theme is the active one. */
  readonly isCustomTheme: boolean;
  /** Loopback URL of the imported image, for the tile thumbnail. */
  readonly customThumb: string | null;
  /** Whether an image has been imported (controls the remove button). */
  readonly hasCustomBackground: boolean;
  /** Whether the native picker is open or the import is still running. */
  readonly isPickingBackground: boolean;
  /**
   * Whether reading the imported background failed. Distinct from "none is
   * imported": without the distinction a failed read looks like an empty state,
   * and the card offers to import an image the user already has.
   */
  readonly customBackgroundFailed: boolean;
  /** Try the read again. */
  readonly onRetryCustomBackground: () => void;
  /** Open the picker and import the chosen image. */
  readonly onPickBackground: () => void;
  /** Forget the imported image and delete its files. */
  readonly onClearBackground: () => void;

  // --- Background adjustments ---
  /** Whether any background adjustment differs from default (shows reset). */
  readonly isBgModified: boolean;
  /** Background image opacity (0–1). */
  readonly bgOpacity: number;
  /** Background image opacity as a rounded percentage. */
  readonly bgOpacityPercent: number;
  /** Min/max/step for the opacity slider. */
  readonly bgOpacityMin: number;
  readonly bgOpacityMax: number;
  readonly bgOpacityStep: number;
  /** Background blur in pixels. */
  readonly bgBlur: number;
  /** Min/max/step for the blur slider. */
  readonly bgBlurMin: number;
  readonly bgBlurMax: number;
  readonly bgBlurStep: number;
  /** Background dim overlay (0–1). */
  readonly bgDim: number;
  /** Background dim overlay as a rounded percentage. */
  readonly bgDimPercent: number;
  /** Min/max/step for the dim slider. */
  readonly bgDimMin: number;
  readonly bgDimMax: number;
  readonly bgDimStep: number;
  /** Set background opacity. */
  readonly onSetBgOpacity: (value: number) => void;
  /** Set background blur. */
  readonly onSetBgBlur: (value: number) => void;
  /** Set background dim. */
  readonly onSetBgDim: (value: number) => void;
  /** How the image fills the viewport. */
  readonly bgFit: ThemeBgFit;
  /** Every available fit mode, in display order. */
  readonly bgFitOptions: readonly ThemeBgFit[];
  /** Set the fit mode. */
  readonly onSetBgFit: (value: ThemeBgFit) => void;
  /** Reset all background adjustments. */
  readonly onResetBg: () => void;

  // --- Accent ---
  /** Whether an accent override is active (controls the reset link). */
  readonly hasAccentOverride: boolean;
  /** Reset the accent override (back to auto). */
  readonly onResetAccent: () => void;
  /** "Follow the record": accent derived from the playing cover's palette. */
  readonly followArtAccent: boolean;
  /** Toggle the follow-the-record accent. */
  readonly onFollowArtChange: (enabled: boolean) => void;
}
