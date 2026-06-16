import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import type { INowPlayingHeroProps, INowPlayingHeroView } from './NowPlayingHero.types';

export function useNowPlayingHero({ show }: INowPlayingHeroProps): INowPlayingHeroView {
  const { t } = useTranslation('common');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const ambientColor = useAmbientColor();
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const enterNowPlaying = useViewStore(s => s.enterNowPlaying);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);

  const visible = Boolean(currentTrack && (!show || show(currentTrack)));
  const track = visible ? currentTrack : null;

  return {
    t,
    track,
    heroStyle: {
      background: `linear-gradient(135deg, rgba(${ambientColor.rgb}, 0.15) 0%, rgba(${ambientColor.rgb}, 0.05) 100%)`,
    },
    showBlurBackdrop: Boolean(track?.albumArt) && !lowPerformanceMode,
    nowPlayingViewEnabled,
    onEnterNowPlaying: enterNowPlaying,
  };
}
