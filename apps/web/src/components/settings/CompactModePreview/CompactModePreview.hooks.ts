import { useTranslation } from 'react-i18next';
import {
  useCompactStore,
  CMP_TITLE_CLASS,
  CMP_ARTIST_CLASS,
  CMP_ALBUM_CLASS,
  type CompactSize,
} from '@/stores/useCompactStore';
import type { ICompactModePreviewView } from './CompactModePreview.types';

const SIZE_WIDTH: Record<CompactSize, number> = {
  sm: 210,
  md: 250,
  lg: 300,
};

export function useCompactModePreview(): ICompactModePreviewView {
  const { t } = useTranslation('settings');

  const compactSize = useCompactStore(s => s.compactSize);
  const compactFontSize = useCompactStore(s => s.compactFontSize);
  const compactShowAlbumArt = useCompactStore(s => s.compactShowAlbumArt);
  const compactShowAlbum = useCompactStore(s => s.compactShowAlbum);
  const compactShowSeek = useCompactStore(s => s.compactShowSeek);
  const compactShowVolume = useCompactStore(s => s.compactShowVolume);
  const compactShowFavorite = useCompactStore(s => s.compactShowFavorite);
  const compactShowLyrics = useCompactStore(s => s.compactShowLyrics);

  const artSize = compactSize === 'sm' ? 36 : compactSize === 'lg' ? 52 : 44;
  const padding = compactSize === 'sm' ? 'p-2' : compactSize === 'lg' ? 'p-3.5' : 'p-3';
  const controlSize = compactSize === 'sm' ? 10 : compactSize === 'lg' ? 14 : 12;

  return {
    title: t('cmp.preview'),
    disclaimer: t('cmp.previewDisclaimer'),
    trackTitle: t('cmp.previewTrackTitle'),
    artist: t('cmp.previewArtist'),
    album: t('cmp.previewAlbum'),

    cardWidth: SIZE_WIDTH[compactSize],
    titleClass: CMP_TITLE_CLASS[compactFontSize],
    artistClass: CMP_ARTIST_CLASS[compactFontSize],
    albumClass: CMP_ALBUM_CLASS[compactFontSize],
    artSize,
    artIconSize: Math.round(artSize * 0.45),
    padding,
    controlSize,

    showAlbumArt: compactShowAlbumArt,
    showAlbum: compactShowAlbum,
    showSeek: compactShowSeek,
    showVolume: compactShowVolume,
    showFavorite: compactShowFavorite,
    showLyrics: compactShowLyrics,
    showGlyphCluster: compactShowFavorite || compactShowLyrics,
  };
}
