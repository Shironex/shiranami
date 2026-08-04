import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { pendingAnalysisInput } from '@/hooks/useAnalysis';
import { isRadioTrack } from '@/lib/utils';
import type { IVisualEffectsSectionView } from './VisualEffectsSection.types';

/** Below this tempo-data coverage the breathing toggle grows a gentle hint. */
const BREATHING_HINT_COVERAGE = 0.5;

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
  const tempoBreathingEnabled = useUIStore(s => s.tempoBreathingEnabled);
  const setTempoBreathingEnabled = useUIStore(s => s.setTempoBreathingEnabled);
  const library = useLibraryStore(s => s.library);

  // The silent-failure guard: a library without tempo data never breathes, and
  // nothing on this card would say why. Below half coverage, point at the one
  // click that fixes it (the analysis card in Library settings).
  const showBreathingHint = useMemo(() => {
    if (!tempoBreathingEnabled) return false;
    const total = library.filter(track => !isRadioTrack(track.filePath)).length;
    if (total === 0) return false;
    const analyzed = total - pendingAnalysisInput(library).length;
    return analyzed / total < BREATHING_HINT_COVERAGE;
  }, [tempoBreathingEnabled, library]);

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

    tempoBreathingLabel: t('app.tempoBreathing'),
    tempoBreathingDescription: t('app.tempoBreathingDesc'),
    tempoBreathingEnabled,
    onTempoBreathingChange: setTempoBreathingEnabled,
    tempoBreathingHint: showBreathingHint ? t('app.tempoBreathingHint') : null,
  };
}
