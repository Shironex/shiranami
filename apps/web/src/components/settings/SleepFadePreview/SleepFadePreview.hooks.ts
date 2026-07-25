import { useTranslation } from 'react-i18next';
import { SLEEP_FADE_MAX_SECONDS } from '@/stores/usePlaybackStore';
import type { ISleepFadePreviewProps, ISleepFadePreviewView } from './SleepFadePreview.types';

const SLEEP_FADE_BARS = 14;
/** Floor so the last bar still draws a sliver instead of vanishing. */
const MIN_BAR_LEVEL = 0.06;

/**
 * The tail of the bar row ramps to silence; a longer fade claims more bars, so
 * the slope visibly flattens as the slider grows.
 */
export function useSleepFadePreview({ duration }: ISleepFadePreviewProps): ISleepFadePreviewView {
  const { t } = useTranslation('settings');

  const fadeBars = Math.max(2, Math.round((duration / SLEEP_FADE_MAX_SECONDS) * SLEEP_FADE_BARS));
  const fadeStart = SLEEP_FADE_BARS - fadeBars;
  const heightFor = (i: number) =>
    i < fadeStart ? 1 : Math.max(MIN_BAR_LEVEL, 1 - (i - fadeStart + 1) / fadeBars);

  return {
    title: t('play.sleepFadePreview'),
    barHeights: Array.from({ length: SLEEP_FADE_BARS }, (_, i) => `${heightFor(i) * 100}%`),
    caption: t('play.sleepFadePreviewCaption', { seconds: duration }),
  };
}
