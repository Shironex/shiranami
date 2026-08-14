import { useTranslation } from 'react-i18next';
import { useThemeStore, CUSTOM_THEME } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import { backgroundUrls, useCustomBackgroundQuery } from '@/hooks/queries/useCustomBackground';
import type { IThemeBackgroundPreviewView } from './ThemeBackgroundPreview.types';

/**
 * The preview's own copy of the source resolution.
 *
 * It deliberately does *not* freeze an animated import the way `ThemeBackground`
 * does: this tile exists so the user can judge what they picked, and showing a
 * still frame of the GIF they just chose would answer a question they did not
 * ask. The full-bleed layer is where the motion preference is honoured.
 */
export function useThemeBackgroundPreview(): IThemeBackgroundPreviewView {
  const { t } = useTranslation('settings');
  const theme = useThemeStore(s => s.theme);
  const bgOpacity = useThemeBgStore(s => s.bgOpacity);
  const bgBlur = useThemeBgStore(s => s.bgBlur);
  const bgDim = useThemeBgStore(s => s.bgDim);
  const bgFit = useThemeBgStore(s => s.bgFit);
  const { data: record } = useCustomBackgroundQuery();

  const isCustom = theme === CUSTOM_THEME;
  const customUrl = isCustom ? backgroundUrls(record).url : null;
  const hasBackground = isCustom ? customUrl !== null : theme !== 'none';

  return {
    theme,
    hasBackground,
    backgroundImage: `url("${customUrl ?? `./themes/${theme}.webp`}")`,
    bgOpacity,
    blurFilter: `blur(${bgBlur}px)`,
    bgDim,
    // Mirrors the stylesheet, which scopes fit to `[data-theme='custom']`: a
    // preview that letterboxed a bundled photo the real background renders
    // full-bleed would be lying about the thing it exists to show.
    bgFit: isCustom ? bgFit : 'cover',
    previewTrack: t('app.bgAdjust.previewTrack'),
    previewArtist: t('app.bgAdjust.previewArtist'),
  };
}
