import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  useUIStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useUIStore';
import {
  useThemeBgStore,
  THEME_BG_OPACITY_MIN,
  THEME_BG_OPACITY_MAX,
  THEME_BG_OPACITY_STEP,
  THEME_BG_BLUR_MIN,
  THEME_BG_BLUR_MAX,
  THEME_BG_BLUR_STEP,
  THEME_BG_DIM_MIN,
  THEME_BG_DIM_MAX,
  THEME_BG_DIM_STEP,
} from '@/stores/useThemeBgStore';
import { useOnboardingStepContext } from '../../stepContext';
import type { IAppearanceStepView, IUiScalePreset } from './AppearanceStep.types';

export function useAppearanceStep(): IAppearanceStepView {
  const { t } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();

  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  const uiScale = useUIStore(s => s.uiScale);
  const setUiScale = useUIStore(s => s.setUiScale);
  const resetUiScale = useUIStore(s => s.resetUiScale);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setLowPerformanceMode = useUIStore(s => s.setLowPerformanceMode);

  const bgOpacity = useThemeBgStore(s => s.bgOpacity);
  const setBgOpacity = useThemeBgStore(s => s.setBgOpacity);
  const bgBlur = useThemeBgStore(s => s.bgBlur);
  const setBgBlur = useThemeBgStore(s => s.setBgBlur);
  const bgDim = useThemeBgStore(s => s.bgDim);
  const setBgDim = useThemeBgStore(s => s.setBgDim);

  const uiScalePresets: IUiScalePreset[] = UI_SCALE_PRESETS.map(value => ({
    value,
    isActive: uiScale === value,
  }));

  return {
    t,
    stepContext,
    theme,
    onSelectTheme: setTheme,
    showBackgroundAdjust: theme !== 'none',

    uiScale,
    canResetUiScale: uiScale !== UI_SCALE_DEFAULT,
    uiScaleResetLabel: t('appearance.uiScaleReset', { value: UI_SCALE_DEFAULT }),
    uiScaleRange: { min: UI_SCALE_MIN, max: UI_SCALE_MAX, step: UI_SCALE_STEP },
    uiScalePresets,
    onSetUiScale: setUiScale,
    onResetUiScale: resetUiScale,

    lowPerformanceMode,
    onSetLowPerformanceMode: setLowPerformanceMode,

    bgOpacity,
    bgOpacityPercent: Math.round(bgOpacity * 100),
    bgOpacityRange: {
      min: THEME_BG_OPACITY_MIN,
      max: THEME_BG_OPACITY_MAX,
      step: THEME_BG_OPACITY_STEP,
    },
    onSetBgOpacity: setBgOpacity,

    bgBlur,
    bgBlurRange: { min: THEME_BG_BLUR_MIN, max: THEME_BG_BLUR_MAX, step: THEME_BG_BLUR_STEP },
    onSetBgBlur: setBgBlur,

    bgDim,
    bgDimPercent: Math.round(bgDim * 100),
    bgDimRange: { min: THEME_BG_DIM_MIN, max: THEME_BG_DIM_MAX, step: THEME_BG_DIM_STEP },
    onSetBgDim: setBgDim,
  };
}
