import type { useTranslation } from 'react-i18next';
import type { ThemeId } from '@/stores/useThemeStore';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** A single UI-scale preset pill. */
export interface IUiScalePreset {
  /** Preset percentage value (also used as the React key). */
  readonly value: number;
  /** Whether this preset matches the current scale. */
  readonly isActive: boolean;
}

/** Numeric bounds + step for a slider control. */
export interface ISliderRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface IAppearanceStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Current theme id. */
  readonly theme: ThemeId;
  /** Select a theme tile. */
  readonly onSelectTheme: (theme: ThemeId) => void;
  /** Whether the background-adjustment block is shown (theme isn't "none"). */
  readonly showBackgroundAdjust: boolean;

  /** Current UI scale (percent). */
  readonly uiScale: number;
  /** Whether the scale differs from the default (shows the reset control). */
  readonly canResetUiScale: boolean;
  /** Localized reset-to-default label. */
  readonly uiScaleResetLabel: string;
  /** UI scale slider bounds. */
  readonly uiScaleRange: ISliderRange;
  /** UI scale preset pills. */
  readonly uiScalePresets: readonly IUiScalePreset[];
  /** Set the UI scale. */
  readonly onSetUiScale: (value: number) => void;
  /** Reset the UI scale to default. */
  readonly onResetUiScale: () => void;

  /** Whether low-performance (reduced effects) mode is on. */
  readonly lowPerformanceMode: boolean;
  /** Toggle low-performance mode. */
  readonly onSetLowPerformanceMode: (value: boolean) => void;

  /** Background image opacity (0..1). */
  readonly bgOpacity: number;
  /** Background opacity as a whole percentage for display. */
  readonly bgOpacityPercent: number;
  /** Background opacity slider bounds. */
  readonly bgOpacityRange: ISliderRange;
  /** Set background opacity. */
  readonly onSetBgOpacity: (value: number) => void;

  /** Background blur in pixels. */
  readonly bgBlur: number;
  /** Background blur slider bounds. */
  readonly bgBlurRange: ISliderRange;
  /** Set background blur. */
  readonly onSetBgBlur: (value: number) => void;

  /** Background dim overlay (0..1). */
  readonly bgDim: number;
  /** Background dim as a whole percentage for display. */
  readonly bgDimPercent: number;
  /** Background dim slider bounds. */
  readonly bgDimRange: ISliderRange;
  /** Set background dim. */
  readonly onSetBgDim: (value: number) => void;
}
