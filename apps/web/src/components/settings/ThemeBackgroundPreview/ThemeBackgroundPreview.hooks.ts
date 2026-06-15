import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import type { IThemeBackgroundPreviewView } from './ThemeBackgroundPreview.types';

export function useThemeBackgroundPreview(): IThemeBackgroundPreviewView {
  const { t } = useTranslation('settings');
  const theme = useThemeStore(s => s.theme);
  const bgOpacity = useThemeBgStore(s => s.bgOpacity);
  const bgBlur = useThemeBgStore(s => s.bgBlur);
  const bgDim = useThemeBgStore(s => s.bgDim);

  return {
    theme,
    hasBackground: theme !== 'none',
    backgroundImage: `url(./themes/${theme}.webp)`,
    bgOpacity,
    blurFilter: `blur(${bgBlur}px)`,
    bgDim,
    previewTrack: t('app.bgAdjust.previewTrack'),
    previewArtist: t('app.bgAdjust.previewArtist'),
  };
}
