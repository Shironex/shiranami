import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import type { IVisualEffectsSectionView } from './VisualEffectsSection.types';

export function useVisualEffectsSection(): IVisualEffectsSectionView {
  const { t } = useTranslation('settings');
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const setNowPlayingViewEnabled = useUIStore(s => s.setNowPlayingViewEnabled);
  const libraryHeroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);
  const setLibraryHeroCardEnabled = useUIStore(s => s.setLibraryHeroCardEnabled);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setLowPerformanceMode = useUIStore(s => s.setLowPerformanceMode);
  const noiseOverlayEnabled = useUIStore(s => s.noiseOverlayEnabled);
  const setNoiseOverlayEnabled = useUIStore(s => s.setNoiseOverlayEnabled);

  return {
    title: t('app.effects'),
    subtitle: t('app.effectsDesc'),

    nowPlayingLabel: t('app.nowPlayingView'),
    nowPlayingDescription: t('app.nowPlayingViewDesc'),
    nowPlayingViewEnabled,
    onNowPlayingChange: setNowPlayingViewEnabled,

    libraryHeroLabel: t('app.libraryHeroCard'),
    libraryHeroDescription: t('app.libraryHeroCardDesc'),
    libraryHeroCardEnabled,
    onLibraryHeroChange: setLibraryHeroCardEnabled,

    lowPerfLabel: t('app.lowPerfMode'),
    lowPerfDescription: t('app.lowPerfModeDesc'),
    lowPerformanceMode,
    onLowPerfChange: setLowPerformanceMode,

    noiseLabel: t('app.noiseOverlay'),
    noiseDescription: t('app.noiseOverlayDesc'),
    noiseOverlayEnabled,
    onNoiseChange: setNoiseOverlayEnabled,
  };
}
