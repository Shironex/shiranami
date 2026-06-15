import { useTranslation } from 'react-i18next';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_MIN,
  LYRICS_PLAIN_OPACITY_MAX,
  LYRICS_PLAIN_OPACITY_STEP,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_MIN,
  LYRICS_SYNCED_DIM_OPACITY_MAX,
  LYRICS_SYNCED_DIM_OPACITY_STEP,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';
import type { ILyricsSectionView } from './LyricsSection.types';

export function useLyricsSection(): ILyricsSectionView {
  const { t: tc } = useTranslation('common');

  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const setLyricsPlainOpacity = useLyricsAppearanceStore(s => s.setLyricsPlainOpacity);
  const setLyricsPlainFontSize = useLyricsAppearanceStore(s => s.setLyricsPlainFontSize);

  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);
  const setLyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.setLyricsSyncedDimOpacity);
  const setLyricsSyncedFontSize = useLyricsAppearanceStore(s => s.setLyricsSyncedFontSize);

  const resetLyricsAppearance = useLyricsAppearanceStore(s => s.resetLyricsAppearance);

  const { t } = useTranslation('settings');

  const isModified =
    lyricsPlainOpacity !== LYRICS_PLAIN_OPACITY_DEFAULT ||
    lyricsPlainFontSize !== LYRICS_PLAIN_FONT_SIZE_DEFAULT ||
    lyricsSyncedDimOpacity !== LYRICS_SYNCED_DIM_OPACITY_DEFAULT ||
    lyricsSyncedFontSize !== LYRICS_SYNCED_FONT_SIZE_DEFAULT;

  return {
    t,
    resetLabel: tc('reset'),

    lyricsPlainOpacity,
    lyricsPlainFontSize,
    onSetPlainOpacity: setLyricsPlainOpacity,
    onSetPlainFontSize: setLyricsPlainFontSize,
    plainOpacityMin: LYRICS_PLAIN_OPACITY_MIN,
    plainOpacityMax: LYRICS_PLAIN_OPACITY_MAX,
    plainOpacityStep: LYRICS_PLAIN_OPACITY_STEP,

    lyricsSyncedDimOpacity,
    lyricsSyncedFontSize,
    onSetSyncedDimOpacity: setLyricsSyncedDimOpacity,
    onSetSyncedFontSize: setLyricsSyncedFontSize,
    syncedDimOpacityMin: LYRICS_SYNCED_DIM_OPACITY_MIN,
    syncedDimOpacityMax: LYRICS_SYNCED_DIM_OPACITY_MAX,
    syncedDimOpacityStep: LYRICS_SYNCED_DIM_OPACITY_STEP,

    isModified,
    onReset: resetLyricsAppearance,
  };
}
