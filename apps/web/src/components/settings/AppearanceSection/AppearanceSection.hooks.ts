import { useTranslation } from 'react-i18next';
import {
  useUIStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useUIStore';
import { useThemeStore, CUSTOM_THEME } from '@/stores/useThemeStore';
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
  THEME_BG_FITS,
  THEME_BG_FIT_DEFAULT,
} from '@/stores/useThemeBgStore';
import { useAccentStore } from '@/stores/useAccentStore';
import {
  backgroundUrls,
  useBackgroundLibraryQuery,
  useEffectiveBackgroundEntry,
} from '@/hooks/queries/useBackgroundLibrary';
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
  const bgFit = useThemeBgStore(s => s.bgFit);
  const setBgFit = useThemeBgStore(s => s.setBgFit);
  const resetBg = useThemeBgStore(s => s.resetBg);
  const { isError: customBackgroundFailed, refetch: refetchCustomBackground } =
    useBackgroundLibraryQuery();
  const effectiveEntry = useEffectiveBackgroundEntry();
  const accentColor = useAccentStore(s => s.accentColor);
  const resetAccent = useAccentStore(s => s.resetAccent);
  const followArtAccent = useAccentStore(s => s.followArtAccent);
  const setFollowArtAccent = useAccentStore(s => s.setFollowArtAccent);

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
    bgDim !== THEME_BG_DIM_DEFAULT ||
    bgFit !== THEME_BG_FIT_DEFAULT;

  const isCustomTheme = theme === CUSTOM_THEME;

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
    // `custom` unlocks the same adjust panel every other image theme gets, but
    // only once an image actually resolves: sliders over an empty background
    // adjust nothing and read as broken. The effective entry is `null` while
    // the query is in flight, after it fails, and when the library is empty —
    // all states where the panel would adjust nothing.
    hasThemeBackground: isCustomTheme ? effectiveEntry !== null : theme !== 'none',
    onSelectTheme: setTheme,

    isCustomTheme,
    customThumb: backgroundUrls(effectiveEntry?.background).url,
    customBackgroundFailed,
    onRetryCustomBackground: () => void refetchCustomBackground(),

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
    bgFit,
    bgFitOptions: THEME_BG_FITS,
    onSetBgFit: setBgFit,
    onResetBg: resetBg,

    hasAccentOverride: accentColor !== null || followArtAccent,
    onResetAccent: resetAccent,
    followArtAccent,
    onFollowArtChange: setFollowArtAccent,
  };
}
