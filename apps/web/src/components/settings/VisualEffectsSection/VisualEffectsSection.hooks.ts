import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useUIStore,
  ROOM_LIGHT_HUE_SHIFT_MAX,
  ROOM_LIGHT_HUE_SHIFT_MIN,
  ROOM_LIGHT_HUE_SHIFT_STEP,
  ROOM_LIGHT_INTENSITY_MAX,
  ROOM_LIGHT_INTENSITY_MIN,
  ROOM_LIGHT_INTENSITY_STEP,
  ROOM_LIGHT_STOP_SETTINGS,
  VINYL_LABEL_SOURCES,
  VINYL_RING_STYLES,
} from '@/stores/useUIStore';
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
  const artworkBloomEnabled = useUIStore(s => s.artworkBloomEnabled);
  const setArtworkBloomEnabled = useUIStore(s => s.setArtworkBloomEnabled);
  const coverCrossfadeEnabled = useUIStore(s => s.coverCrossfadeEnabled);
  const setCoverCrossfadeEnabled = useUIStore(s => s.setCoverCrossfadeEnabled);
  const vinylDisplayEnabled = useUIStore(s => s.vinylDisplayEnabled);
  const setVinylDisplayEnabled = useUIStore(s => s.setVinylDisplayEnabled);
  const vinylLabelSource = useUIStore(s => s.vinylLabelSource);
  const setVinylLabelSource = useUIStore(s => s.setVinylLabelSource);
  const vinylRingStyle = useUIStore(s => s.vinylRingStyle);
  const setVinylRingStyle = useUIStore(s => s.setVinylRingStyle);
  const roomLightEnabled = useUIStore(s => s.roomLightEnabled);
  const setRoomLightEnabled = useUIStore(s => s.setRoomLightEnabled);
  const roomLightStop = useUIStore(s => s.roomLightStop);
  const setRoomLightStop = useUIStore(s => s.setRoomLightStop);
  const roomLightIntensity = useUIStore(s => s.roomLightIntensity);
  const setRoomLightIntensity = useUIStore(s => s.setRoomLightIntensity);
  const roomLightHueShift = useUIStore(s => s.roomLightHueShift);
  const setRoomLightHueShift = useUIStore(s => s.setRoomLightHueShift);
  const library = useLibraryStore(s => s.library);

  const vinylLabelOptions = VINYL_LABEL_SOURCES.map(value => ({
    value,
    label: t(`app.vinylDisplayLabel.${value}`),
    isActive: vinylLabelSource === value,
  }));

  const vinylRingOptions = VINYL_RING_STYLES.map(value => ({
    value,
    label: t(`app.vinylRing.${value}`),
    isActive: vinylRingStyle === value,
  }));

  const roomLightStopOptions = ROOM_LIGHT_STOP_SETTINGS.map(value => ({
    value,
    label: t(`app.roomLightStops.${value}`),
    isActive: roomLightStop === value,
  }));

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

    vinylDisplayLabel: t('app.vinylDisplay'),
    vinylDisplayDescription: t('app.vinylDisplayDesc'),
    vinylDisplayEnabled,
    onVinylDisplayChange: setVinylDisplayEnabled,

    vinylLabelTitle: t('app.vinylDisplayLabelTitle'),
    vinylLabelDescription: t('app.vinylDisplayLabelDesc'),
    vinylLabelOptions,
    onSelectVinylLabelSource: setVinylLabelSource,

    vinylRingTitle: t('app.vinylRingTitle'),
    vinylRingDescription: t('app.vinylRingDesc'),
    vinylRingOptions,
    onSelectVinylRingStyle: setVinylRingStyle,

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

    artworkBloomLabel: t('app.artworkBloom'),
    artworkBloomDescription: t('app.artworkBloomDesc'),
    artworkBloomEnabled,
    onArtworkBloomChange: setArtworkBloomEnabled,

    coverCrossfadeLabel: t('app.coverCrossfade'),
    coverCrossfadeDescription: t('app.coverCrossfadeDesc'),
    coverCrossfadeEnabled,
    onCoverCrossfadeChange: setCoverCrossfadeEnabled,

    roomLightLabel: t('app.roomLight'),
    roomLightDescription: t('app.roomLightDesc'),
    roomLightEnabled,
    onRoomLightChange: setRoomLightEnabled,

    roomLightStopTitle: t('app.roomLightStopTitle'),
    roomLightStopDescription: t('app.roomLightStopDesc'),
    roomLightStopOptions,
    onSelectRoomLightStop: setRoomLightStop,

    roomLightIntensityTitle: t('app.roomLightIntensityTitle'),
    roomLightIntensityDescription: t('app.roomLightIntensityDesc'),
    roomLightIntensity,
    roomLightIntensityMin: ROOM_LIGHT_INTENSITY_MIN,
    roomLightIntensityMax: ROOM_LIGHT_INTENSITY_MAX,
    roomLightIntensityStep: ROOM_LIGHT_INTENSITY_STEP,
    onRoomLightIntensityChange: setRoomLightIntensity,

    roomLightHueTitle: t('app.roomLightHueTitle'),
    roomLightHueDescription: t('app.roomLightHueDesc'),
    roomLightHueShift,
    roomLightHueValueLabel: `${roomLightHueShift > 0 ? '+' : ''}${roomLightHueShift}°`,
    roomLightHueMin: ROOM_LIGHT_HUE_SHIFT_MIN,
    roomLightHueMax: ROOM_LIGHT_HUE_SHIFT_MAX,
    roomLightHueStep: ROOM_LIGHT_HUE_SHIFT_STEP,
    roomLightHueCoolerLabel: t('app.roomLightHueCooler'),
    roomLightHueWarmerLabel: t('app.roomLightHueWarmer'),
    onRoomLightHueShiftChange: setRoomLightHueShift,

    tempoBreathingLabel: t('app.tempoBreathing'),
    tempoBreathingDescription: t('app.tempoBreathingDesc'),
    tempoBreathingEnabled,
    onTempoBreathingChange: setTempoBreathingEnabled,
    tempoBreathingHint: showBreathingHint ? t('app.tempoBreathingHint') : null,
  };
}
