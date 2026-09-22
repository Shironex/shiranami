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
  VINYL_FINISHES,
  VINYL_LABEL_SOURCES,
  VINYL_RING_STYLES,
  VINYL_SIZES,
  VINYL_SPEEDS,
} from '@/stores/useUIStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { pendingAnalysisInput } from '@/hooks/useAnalysis';
import { isRadioTrack } from '@/lib/utils';
import type { IChipOption, IVisualEffectsSectionView } from './VisualEffectsSection.types';

/** Below this tempo-data coverage the breathing toggle grows a gentle hint. */
const BREATHING_HINT_COVERAGE = 0.5;

/** Build render-ready chips for one vinyl option picker. */
function chipOptions<T extends string>(
  values: readonly T[],
  active: T,
  label: (value: T) => string
): IChipOption<T>[] {
  return values.map(value => ({ value, label: label(value), isActive: active === value }));
}

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
  const vinylSpeed = useUIStore(s => s.vinylSpeed);
  const setVinylSpeed = useUIStore(s => s.setVinylSpeed);
  const vinylFinish = useUIStore(s => s.vinylFinish);
  const setVinylFinish = useUIStore(s => s.setVinylFinish);
  const vinylTonearmEnabled = useUIStore(s => s.vinylTonearmEnabled);
  const setVinylTonearmEnabled = useUIStore(s => s.setVinylTonearmEnabled);
  const vinylNowPlayingSize = useUIStore(s => s.vinylNowPlayingSize);
  const setVinylNowPlayingSize = useUIStore(s => s.setVinylNowPlayingSize);
  const vinylSanctuarySize = useUIStore(s => s.vinylSanctuarySize);
  const setVinylSanctuarySize = useUIStore(s => s.setVinylSanctuarySize);
  const roomLightEnabled = useUIStore(s => s.roomLightEnabled);
  const setRoomLightEnabled = useUIStore(s => s.setRoomLightEnabled);
  const roomLightStop = useUIStore(s => s.roomLightStop);
  const setRoomLightStop = useUIStore(s => s.setRoomLightStop);
  const roomLightIntensity = useUIStore(s => s.roomLightIntensity);
  const setRoomLightIntensity = useUIStore(s => s.setRoomLightIntensity);
  const roomLightHueShift = useUIStore(s => s.roomLightHueShift);
  const setRoomLightHueShift = useUIStore(s => s.setRoomLightHueShift);
  const library = useLibraryStore(s => s.library);

  const vinylLabelOptions = chipOptions(VINYL_LABEL_SOURCES, vinylLabelSource, value =>
    t(`app.vinylDisplayLabel.${value}`)
  );
  const vinylRingOptions = chipOptions(VINYL_RING_STYLES, vinylRingStyle, value =>
    t(`app.vinylRing.${value}`)
  );
  const vinylSpeedOptions = chipOptions(VINYL_SPEEDS, vinylSpeed, value =>
    t(`app.vinylSpeed.${value}`)
  );
  const vinylFinishOptions = chipOptions(VINYL_FINISHES, vinylFinish, value =>
    t(`app.vinylFinish.${value}`)
  );
  const vinylSizeNowPlayingOptions = chipOptions(VINYL_SIZES, vinylNowPlayingSize, value =>
    t(`app.vinylSize.${value}`)
  );
  const vinylSizeSanctuaryOptions = chipOptions(VINYL_SIZES, vinylSanctuarySize, value =>
    t(`app.vinylSize.${value}`)
  );

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

    vinylSpeedTitle: t('app.vinylSpeedTitle'),
    vinylSpeedDescription: t('app.vinylSpeedDesc'),
    vinylSpeedOptions,
    onSelectVinylSpeed: setVinylSpeed,

    vinylFinishTitle: t('app.vinylFinishTitle'),
    vinylFinishDescription: t('app.vinylFinishDesc'),
    vinylFinishOptions,
    onSelectVinylFinish: setVinylFinish,

    vinylSizeTitle: t('app.vinylSizeTitle'),
    vinylSizeDescription: t('app.vinylSizeDesc'),
    vinylSizeNowPlayingLabel: t('app.vinylSizeNowPlaying'),
    vinylSizeNowPlayingOptions,
    onSelectVinylNowPlayingSize: setVinylNowPlayingSize,
    vinylSizeSanctuaryLabel: t('app.vinylSizeSanctuary'),
    vinylSizeSanctuaryOptions,
    onSelectVinylSanctuarySize: setVinylSanctuarySize,

    vinylTonearmLabel: t('app.vinylTonearm'),
    vinylTonearmDescription: t('app.vinylTonearmDesc'),
    vinylTonearmEnabled,
    onVinylTonearmChange: setVinylTonearmEnabled,

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
