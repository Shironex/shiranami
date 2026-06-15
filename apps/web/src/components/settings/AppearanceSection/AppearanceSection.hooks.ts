import { useTranslation } from 'react-i18next';
import {
  useUIStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useUIStore';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  useThemeBgStore,
  THEME_BG_OPACITY_MIN,
  THEME_BG_OPACITY_MAX,
  THEME_BG_OPACITY_STEP,
  THEME_BG_OPACITY_DEFAULT,
  THEME_BG_BLUR_MIN,
  THEME_BG_BLUR_MAX,
  THEME_BG_BLUR_STEP,
  THEME_BG_BLUR_DEFAULT,
  THEME_BG_DIM_MIN,
  THEME_BG_DIM_MAX,
  THEME_BG_DIM_STEP,
  THEME_BG_DIM_DEFAULT,
} from '@/stores/useThemeBgStore';
import { useAccentStore } from '@/stores/useAccentStore';
import { SUPPORTED_LANGUAGES, persistLanguage, type SupportedLanguage } from '@/lib/i18n';
import type { IAppearanceSectionView } from './AppearanceSection.types';

export function useAppearanceSection(): IAppearanceSectionView {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const uiScale = useUIStore(s => s.uiScale);
  const setUiScale = useUIStore(s => s.setUiScale);
  const resetUiScale = useUIStore(s => s.resetUiScale);
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const bgOpacity = useThemeBgStore(s => s.bgOpacity);
  const setBgOpacity = useThemeBgStore(s => s.setBgOpacity);
  const bgBlur = useThemeBgStore(s => s.bgBlur);
  const setBgBlur = useThemeBgStore(s => s.setBgBlur);
  const bgDim = useThemeBgStore(s => s.bgDim);
  const setBgDim = useThemeBgStore(s => s.setBgDim);
  const resetBg = useThemeBgStore(s => s.resetBg);
  const accentColor = useAccentStore(s => s.accentColor);
  const resetAccent = useAccentStore(s => s.resetAccent);

  const languageOptions = SUPPORTED_LANGUAGES.map(lang => ({
    code: lang.code,
    label: lang.label,
    isActive: i18n.language === lang.code,
  }));

  const scalePresets = UI_SCALE_PRESETS.map(preset => ({
    value: preset,
    isActive: uiScale === preset,
  }));

  const isBgModified =
    bgOpacity !== THEME_BG_OPACITY_DEFAULT ||
    bgBlur !== THEME_BG_BLUR_DEFAULT ||
    bgDim !== THEME_BG_DIM_DEFAULT;

  function onSelectLanguage(lang: SupportedLanguage): void {
    void i18n.changeLanguage(lang);
    persistLanguage(lang);
  }

  return {
    t,
    resetLabel: tc('reset'),

    languageOptions,
    onSelectLanguage,

    uiScale,
    uiScaleMin: UI_SCALE_MIN,
    uiScaleMax: UI_SCALE_MAX,
    uiScaleStep: UI_SCALE_STEP,
    isScaleModified: uiScale !== UI_SCALE_DEFAULT,
    scalePresets,
    onSetUiScale: setUiScale,
    onResetUiScale: resetUiScale,

    theme,
    hasThemeBackground: theme !== 'none',
    onSelectTheme: setTheme,

    isBgModified,
    bgOpacity,
    bgOpacityPercent: Math.round(bgOpacity * 100),
    bgOpacityMin: THEME_BG_OPACITY_MIN,
    bgOpacityMax: THEME_BG_OPACITY_MAX,
    bgOpacityStep: THEME_BG_OPACITY_STEP,
    bgBlur,
    bgBlurMin: THEME_BG_BLUR_MIN,
    bgBlurMax: THEME_BG_BLUR_MAX,
    bgBlurStep: THEME_BG_BLUR_STEP,
    bgDim,
    bgDimPercent: Math.round(bgDim * 100),
    bgDimMin: THEME_BG_DIM_MIN,
    bgDimMax: THEME_BG_DIM_MAX,
    bgDimStep: THEME_BG_DIM_STEP,
    onSetBgOpacity: setBgOpacity,
    onSetBgBlur: setBgBlur,
    onSetBgDim: setBgDim,
    onResetBg: resetBg,

    hasAccentOverride: accentColor !== null,
    onResetAccent: resetAccent,
  };
}
