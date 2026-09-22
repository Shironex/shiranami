import { useEffect } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { BEAT_PROPS, breathingPeriods, type IBreathingPeriods } from '@/lib/tempoBreathing';

export interface ITempoBreathing {
  /** Breathing engages: BPM known, toggle on, decorative motion allowed. */
  readonly active: boolean;
  /** The calm periods, or null when breathing is inactive. */
  readonly periods: IBreathingPeriods | null;
}

/**
 * Read side of tempo-locked breathing: derives whether the app breathes with
 * the current track and at which periods. Inactive whenever the track has no
 * stored BPM (unanalysed, undetectable, or a radio stream), the settings
 * toggle is off, or decorative motion is suppressed (reduced motion or
 * low-performance mode) — consumers then keep their fixed-period animations.
 */
export function useTempoBreathing(): ITempoBreathing {
  const bpm = usePlaybackStore(s => s.currentTrack?.bpm ?? null);
  const enabled = useUIStore(s => s.tempoBreathingEnabled);
  const motionOk = useDecorativeMotion();
  const periods = enabled && motionOk ? breathingPeriods(bpm) : null;
  return { active: periods !== null, periods };
}

/**
 * Write side, mounted once in App: publishes the beat custom properties on
 * `<html>` (the `applyArtProperties` / `applyAccent` precedent) so surfaces
 * with no playback subscription — the mascot float utility — breathe too.
 *
 * The values change discretely at track boundaries rather than tweening:
 * continuously re-writing a running CSS animation's duration re-divides its
 * elapsed time and strobes the phase. The dominant surface (the bloom)
 * composes with the visual crossfade instead — each incoming bloom slot
 * starts its swell at phase zero and cross-dissolves over the outgoing one.
 */
export function useTempoBreathingPublisher(): void {
  const { periods } = useTempoBreathing();
  const beat = periods?.beat ?? null;
  const bloom = periods?.bloom ?? null;
  const float = periods?.float ?? null;
  const pulse = periods?.pulse ?? null;

  useEffect(() => {
    const style = document.documentElement.style;
    if (beat === null || bloom === null || float === null || pulse === null) {
      Object.values(BEAT_PROPS).forEach(prop => style.removeProperty(prop));
      return;
    }
    style.setProperty(BEAT_PROPS.beat, `${beat}s`);
    style.setProperty(BEAT_PROPS.bloom, `${bloom}s`);
    style.setProperty(BEAT_PROPS.float, `${float}s`);
    style.setProperty(BEAT_PROPS.pulse, `${pulse}s`);
    return () => {
      Object.values(BEAT_PROPS).forEach(prop => style.removeProperty(prop));
    };
  }, [beat, bloom, float, pulse]);
}
