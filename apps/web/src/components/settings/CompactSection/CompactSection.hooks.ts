import { useTranslation } from 'react-i18next';
import {
  useCompactStore,
  COMPACT_AMBIENT_INTENSITY_MIN,
  COMPACT_AMBIENT_INTENSITY_MAX,
  COMPACT_AMBIENT_INTENSITY_STEP,
  COMPACT_AMBIENT_INTENSITY_DEFAULT,
  COMPACT_SIZE_DEFAULT,
  COMPACT_FONT_SIZE_DEFAULT,
  type CompactSize,
  type CompactFontSize,
} from '@/stores/useCompactStore';
import type {
  ICompactPresetOption,
  ICompactSectionView,
  ICompactToggle,
} from './CompactSection.types';

const SIZES: CompactSize[] = ['sm', 'md', 'lg'];
const FONT_SIZES: CompactFontSize[] = ['sm', 'md', 'lg'];

export function useCompactSection(): ICompactSectionView {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');

  const compactSize = useCompactStore(s => s.compactSize);
  const compactFontSize = useCompactStore(s => s.compactFontSize);
  const compactAmbientIntensity = useCompactStore(s => s.compactAmbientIntensity);
  const compactShowAlbumArt = useCompactStore(s => s.compactShowAlbumArt);
  const compactShowAlbum = useCompactStore(s => s.compactShowAlbum);
  const compactShowSeek = useCompactStore(s => s.compactShowSeek);
  const compactShowVolume = useCompactStore(s => s.compactShowVolume);
  const compactShowFavorite = useCompactStore(s => s.compactShowFavorite);
  const compactShowLyrics = useCompactStore(s => s.compactShowLyrics);
  const compactDefaultAlwaysOnTop = useCompactStore(s => s.compactDefaultAlwaysOnTop);

  const setCompactSize = useCompactStore(s => s.setCompactSize);
  const setCompactFontSize = useCompactStore(s => s.setCompactFontSize);
  const setCompactAmbientIntensity = useCompactStore(s => s.setCompactAmbientIntensity);
  const setCompactShowAlbumArt = useCompactStore(s => s.setCompactShowAlbumArt);
  const setCompactShowAlbum = useCompactStore(s => s.setCompactShowAlbum);
  const setCompactShowSeek = useCompactStore(s => s.setCompactShowSeek);
  const setCompactShowVolume = useCompactStore(s => s.setCompactShowVolume);
  const setCompactShowFavorite = useCompactStore(s => s.setCompactShowFavorite);
  const setCompactShowLyrics = useCompactStore(s => s.setCompactShowLyrics);
  const setCompactDefaultAlwaysOnTop = useCompactStore(s => s.setCompactDefaultAlwaysOnTop);
  const resetCompactAppearance = useCompactStore(s => s.resetCompactAppearance);

  const isModified =
    compactSize !== COMPACT_SIZE_DEFAULT ||
    compactFontSize !== COMPACT_FONT_SIZE_DEFAULT ||
    compactAmbientIntensity !== COMPACT_AMBIENT_INTENSITY_DEFAULT ||
    !compactShowAlbumArt ||
    !compactShowAlbum ||
    !compactShowSeek ||
    !compactShowVolume ||
    compactShowFavorite ||
    compactShowLyrics ||
    compactDefaultAlwaysOnTop;

  const sizeOptions: ICompactPresetOption<CompactSize>[] = SIZES.map(value => ({
    value,
    label: t(`cmp.size.${value}`),
    isActive: compactSize === value,
  }));

  const fontSizeOptions: ICompactPresetOption<CompactFontSize>[] = FONT_SIZES.map(value => ({
    value,
    label: t(`cmp.fontSize.${value}`),
    isActive: compactFontSize === value,
  }));

  // Show as percent of max so users can read the slider as a 0–100 dial.
  const ambientPercent =
    COMPACT_AMBIENT_INTENSITY_MAX > 0
      ? Math.round((compactAmbientIntensity / COMPACT_AMBIENT_INTENSITY_MAX) * 100)
      : 0;

  const elementToggles: ICompactToggle[] = [
    {
      key: 'albumArt',
      label: t('cmp.elements.albumArt'),
      description: t('cmp.elements.albumArtDesc'),
      checked: compactShowAlbumArt,
      onChange: setCompactShowAlbumArt,
      divider: false,
    },
    {
      key: 'album',
      label: t('cmp.elements.album'),
      description: t('cmp.elements.albumDesc'),
      checked: compactShowAlbum,
      onChange: setCompactShowAlbum,
      divider: true,
    },
    {
      key: 'seek',
      label: t('cmp.elements.seek'),
      description: t('cmp.elements.seekDesc'),
      checked: compactShowSeek,
      onChange: setCompactShowSeek,
      divider: true,
    },
    {
      key: 'volume',
      label: t('cmp.elements.volume'),
      description: t('cmp.elements.volumeDesc'),
      checked: compactShowVolume,
      onChange: setCompactShowVolume,
      divider: true,
    },
    {
      key: 'favorite',
      label: t('cmp.elements.favorite'),
      description: t('cmp.elements.favoriteDesc'),
      checked: compactShowFavorite,
      onChange: setCompactShowFavorite,
      divider: true,
    },
    {
      key: 'lyrics',
      label: t('cmp.elements.lyrics'),
      description: t('cmp.elements.lyricsDesc'),
      checked: compactShowLyrics,
      onChange: setCompactShowLyrics,
      divider: true,
    },
  ];

  return {
    t,
    resetLabel: tc('reset'),
    isModified,
    onReset: resetCompactAppearance,

    sizeControl: {
      title: t('cmp.size.title'),
      description: t('cmp.size.desc'),
      options: sizeOptions,
    },
    onSetSize: setCompactSize,
    fontSizeControl: {
      title: t('cmp.fontSize.title'),
      description: t('cmp.fontSize.desc'),
      options: fontSizeOptions,
    },
    onSetFontSize: setCompactFontSize,
    ambientControl: {
      title: t('cmp.ambient.title'),
      description: t('cmp.ambient.desc'),
      value: compactAmbientIntensity,
      percent: ambientPercent,
      min: COMPACT_AMBIENT_INTENSITY_MIN,
      max: COMPACT_AMBIENT_INTENSITY_MAX,
      step: COMPACT_AMBIENT_INTENSITY_STEP,
    },
    onSetAmbientIntensity: setCompactAmbientIntensity,

    elementToggles,

    behaviorToggle: {
      key: 'defaultAlwaysOnTop',
      label: t('cmp.behavior.defaultAlwaysOnTop'),
      description: t('cmp.behavior.defaultAlwaysOnTopDesc'),
      checked: compactDefaultAlwaysOnTop,
      onChange: setCompactDefaultAlwaysOnTop,
      divider: false,
    },
  };
}
