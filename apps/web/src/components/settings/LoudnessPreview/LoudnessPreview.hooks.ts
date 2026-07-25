import { useTranslation } from 'react-i18next';
import { LOUDNESS_TARGET_MIN_LUFS, LOUDNESS_TARGET_MAX_LUFS } from '@/stores/usePlaybackStore';
import type { ILoudnessPreviewProps, ILoudnessPreviewView } from './LoudnessPreview.types';

// A few illustrative tracks at varying perceived loudness (as a 0..1 fraction
// of the bar height). When leveling is OFF they sit at these raw levels; when
// ON they converge toward the shared target line.
const LOUDNESS_BARS = [0.34, 0.86, 0.52, 0.95, 0.68] as const;

/** Full bar-column height in rem that a 1.0 level maps to. */
const BAR_SCALE_REM = 3.5;
/** Floor so a near-silent track still draws a visible sliver. */
const BAR_MIN_LEVEL = 0.1;
/** Bottom padding of the bar column the target line is measured from. */
const BAR_BASELINE_REM = '0.75rem';

/**
 * Maps the target LUFS onto the bar column's 0..1 height (louder target = taller)
 * and converges every track toward it while leveling is on.
 */
export function useLoudnessPreview({
  enabled,
  target,
}: ILoudnessPreviewProps): ILoudnessPreviewView {
  const { t } = useTranslation('settings');

  const targetFrac =
    (target - LOUDNESS_TARGET_MIN_LUFS) / (LOUDNESS_TARGET_MAX_LUFS - LOUDNESS_TARGET_MIN_LUFS);
  const levelFor = (raw: number) => (enabled ? targetFrac : raw);

  return {
    title: t('play.loudnessPreview'),
    targetLabel: `${target} LUFS`,
    targetLineBottom: `calc(${BAR_BASELINE_REM} + ${targetFrac * BAR_SCALE_REM}rem)`,
    barHeights: LOUDNESS_BARS.map(
      raw => `${Math.max(BAR_MIN_LEVEL, levelFor(raw)) * BAR_SCALE_REM}rem`
    ),
    caption: enabled ? t('play.loudnessPreviewOn') : t('play.loudnessPreviewOff'),
  };
}
