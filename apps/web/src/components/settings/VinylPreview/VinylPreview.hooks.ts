import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore, type VinylSize } from '@/stores/useUIStore';
import type { IVinylPreviewProps, IVinylPreviewView } from './VinylPreview.types';

/**
 * Miniature disc diameters per size preference. The two stages share the
 * scale — only the *relative* difference needs to read in a preview.
 */
const PREVIEW_DISC_PX: Record<VinylSize, number> = {
  small: 64,
  medium: 78,
  large: 92,
};

/**
 * VinylPreview shows live miniatures of the actual VinylRecord component —
 * one per stage (Now Playing / Sanctuary), each sized by its own preference,
 * so every vinyl choice (speed, finish, ring, label, tonearm, sizes) reflects
 * immediately. The hook resolves the captions, the per-stage sizes, and the
 * playing track's cover (which makes the artwork label and the picture-disc
 * finish previewable); the shell stays a thin render.
 */
export function useVinylPreview({ enabled }: IVinylPreviewProps): IVinylPreviewView {
  const { t } = useTranslation('settings');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const nowPlayingSize = useUIStore(s => s.vinylNowPlayingSize);
  const sanctuarySize = useUIStore(s => s.vinylSanctuarySize);

  return {
    title: t('app.effectPreview.vinyl'),
    enabled,
    stages: [
      {
        id: 'now-playing',
        caption: t('app.vinylSizeNowPlaying'),
        px: PREVIEW_DISC_PX[nowPlayingSize],
      },
      {
        id: 'sanctuary',
        caption: t('app.vinylSizeSanctuary'),
        px: PREVIEW_DISC_PX[sanctuarySize],
      },
    ],
    albumArt: currentTrack?.albumArt ?? null,
  };
}
