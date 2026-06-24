import { useTranslation } from 'react-i18next';
import {
  usePlaybackStore,
  SLEEP_FADE_MIN_SECONDS,
  SLEEP_FADE_MAX_SECONDS,
  LOUDNESS_TARGET_MIN_LUFS,
  LOUDNESS_TARGET_MAX_LUFS,
} from '@/stores/usePlaybackStore';
import { useLoudnessAnalysis } from '@/hooks/useLoudnessAnalysis';
import { useBpmKeyAnalysis } from '@/hooks/useBpmKeyAnalysis';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/queries/useSettings';
import type { IPlaybackSectionView } from './PlaybackSection.types';

const CROSSFADE_MIN_SECONDS = 1;
const CROSSFADE_MAX_SECONDS = 12;

export function usePlaybackSection(): IPlaybackSectionView {
  const { t } = useTranslation('settings');
  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();

  const rememberPlaybackPosition = settings?.rememberPlaybackPosition ?? false;

  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlaybackStore(s => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlaybackStore(s => s.setCrossfadeDuration);

  const sleepFadeDuration = usePlaybackStore(s => s.sleepFadeDuration);
  const setSleepFadeDuration = usePlaybackStore(s => s.setSleepFadeDuration);

  const loudnessEnabled = usePlaybackStore(s => s.loudnessEnabled);
  const loudnessTargetLufs = usePlaybackStore(s => s.loudnessTargetLufs);
  const setLoudnessEnabled = usePlaybackStore(s => s.setLoudnessEnabled);
  const setLoudnessTargetLufs = usePlaybackStore(s => s.setLoudnessTargetLufs);
  const loudness = useLoudnessAnalysis();
  const analysis = useBpmKeyAnalysis();

  const loudnessAnalysisStatus = loudness.running
    ? t('play.loudnessAnalyzing', { current: loudness.current, total: loudness.total })
    : t('play.loudnessAnalyzeDesc');

  const analysisStatus = analysis.running
    ? t('play.analysisAnalyzing', { current: analysis.current, total: analysis.total })
    : t('play.analysisAnalyzeDesc');

  return {
    title: t('play.title'),
    subtitle: t('play.subtitle'),

    resumeLabel: t('play.rememberPosition'),
    resumeDescription: t('play.rememberDesc'),
    rememberPlaybackPosition,
    onRememberChange: value => updateSettings.mutate({ rememberPlaybackPosition: value }),

    crossfadeLabel: t('play.crossfade'),
    crossfadeDescription: t('play.crossfadeDesc'),
    crossfadeEnabled,
    onCrossfadeEnabledChange: setCrossfadeEnabled,
    durationLabel: t('play.duration'),
    crossfadeDuration,
    crossfadeMin: CROSSFADE_MIN_SECONDS,
    crossfadeMax: CROSSFADE_MAX_SECONDS,
    onCrossfadeDurationChange: setCrossfadeDuration,

    loudnessLabel: t('play.loudness'),
    loudnessDescription: t('play.loudnessDesc'),
    loudnessEnabled,
    onLoudnessEnabledChange: setLoudnessEnabled,
    loudnessTargetLabel: t('play.loudnessTarget'),
    loudnessTargetLufs,
    loudnessMin: LOUDNESS_TARGET_MIN_LUFS,
    loudnessMax: LOUDNESS_TARGET_MAX_LUFS,
    onLoudnessTargetChange: setLoudnessTargetLufs,

    loudnessAnalysisRunning: loudness.running,
    loudnessAnalysisStatus,
    loudnessAnalyzeLabel: t('play.loudnessAnalyze'),
    loudnessCancelLabel: t('play.loudnessCancel'),
    onStartLoudnessAnalysis: () => void loudness.start(),
    onCancelLoudnessAnalysis: loudness.cancel,

    analysisLabel: t('play.analysis'),
    analysisDescription: t('play.analysisDesc'),
    analysisRunning: analysis.running,
    analysisStatus,
    analysisAnalyzeLabel: t('play.analysisAnalyze'),
    analysisCancelLabel: t('play.analysisCancel'),
    onStartAnalysis: () => void analysis.start(),
    onCancelAnalysis: analysis.cancel,

    sleepFadeLabel: t('play.sleepFade'),
    sleepFadeDescription: t('play.sleepFadeDesc'),
    sleepFadeDurationLabel: t('play.sleepFadeDuration'),
    sleepFadeDuration,
    sleepFadeMin: SLEEP_FADE_MIN_SECONDS,
    sleepFadeMax: SLEEP_FADE_MAX_SECONDS,
    onSleepFadeDurationChange: setSleepFadeDuration,
  };
}
