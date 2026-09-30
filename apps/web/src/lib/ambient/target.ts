/**
 * What the ambience should be doing right now, as a pure function of the
 * player's state. The driver feeds it store snapshots; the engine only ever
 * sees its output. Keeping the policy here (and out of the Web Audio code)
 * is what makes the sleep-timer coupling unit-testable.
 */

import {
  AMBIENT_LAYER_IDS,
  AMBIENT_LEVEL_STEP,
  type AmbientLayerId,
  type AmbientLevels,
} from '@/stores/useAmbientStore';

/**
 * - `idle`: fade out, then stop every source and leave the audio graph, so
 *   silence costs nothing.
 * - `play`: fade in to `gains` and hold.
 * - `sleep`: follow the sleep timer's fade to silence over
 *   `sleepFadeSeconds`, then hold at zero. Kept distinct from `idle` so a
 *   cancelled timer can bring the level straight back.
 */
export type AmbientMode = 'idle' | 'play' | 'sleep';

export interface AmbientTarget {
  readonly mode: AmbientMode;
  /** Final linear gain per layer: slider curve × player volume. */
  readonly gains: Readonly<Record<AmbientLayerId, number>>;
  readonly sleepFadeSeconds: number;
  /**
   * Keep rendered/decoded layers cached while idle. True while ambience is
   * switched on (a pause should resume instantly); false releases the
   * buffers once the fade-out completes.
   */
  readonly keepBuffers: boolean;
}

export interface AmbientInputs {
  readonly enabled: boolean;
  readonly levels: AmbientLevels;
  readonly keepWhenPaused: boolean;
  readonly followWeather: boolean;
  /** The opt-in weather currently reports rain or a thunderstorm. */
  readonly raining: boolean;
  readonly isPlaying: boolean;
  readonly volume: number;
  readonly isMuted: boolean;
  /** The sleep timer is fading the music out. */
  readonly sleepFading: boolean;
  /** A sleep timer ran out on paused music that ambience was playing over. */
  readonly pausedSleepFading: boolean;
  /** The last sleep-timer ending silenced ambience until the music plays again. */
  readonly sleptOut: boolean;
  readonly sleepFadeSeconds: number;
}

/**
 * Where "Follow the weather" lifts the rain slider to while it rains, if the
 * listener has it lower. It only ever raises: a listener who likes loud rain
 * keeps it.
 */
export const FOLLOW_WEATHER_RAIN_LEVEL = 0.6;

/**
 * Slider position to linear gain. Squared, so the slider's travel is spread
 * evenly by ear (a linear gain crams all the audible change into the bottom
 * fifth of the slider).
 */
export function levelToGain(level: number): number {
  if (level < AMBIENT_LEVEL_STEP) return 0;
  return level * level;
}

export function effectiveLevel(
  id: AmbientLayerId,
  inputs: Pick<AmbientInputs, 'levels' | 'followWeather' | 'raining'>
): number {
  const level = inputs.levels[id];
  if (id === 'rain' && inputs.followWeather && inputs.raining) {
    return Math.max(level, FOLLOW_WEATHER_RAIN_LEVEL);
  }
  return level;
}

export function computeAmbientTarget(inputs: AmbientInputs): AmbientTarget {
  // The player volume (and mute) scales ambience too: it is the app's volume,
  // and a muted player playing rain would read as a bug.
  const master = inputs.isMuted ? 0 : Math.max(0, Math.min(1, inputs.volume));
  const gains = {} as Record<AmbientLayerId, number>;
  let audible = false;
  for (const id of AMBIENT_LAYER_IDS) {
    const gain = inputs.enabled ? levelToGain(effectiveLevel(id, inputs)) * master : 0;
    gains[id] = gain;
    if (gain > 0) audible = true;
  }

  let mode: AmbientMode = 'idle';
  if (audible) {
    if (inputs.isPlaying) {
      mode = inputs.sleepFading ? 'sleep' : 'play';
    } else if (inputs.keepWhenPaused && !inputs.sleptOut) {
      mode = inputs.pausedSleepFading ? 'sleep' : 'play';
    }
  }

  return {
    mode,
    gains,
    sleepFadeSeconds: Math.max(0.1, inputs.sleepFadeSeconds),
    keepBuffers: inputs.enabled,
  };
}

/** The two playback facts the sleep latch follows. */
export interface SleepSnapshot {
  readonly isPlaying: boolean;
  readonly sleepFading: boolean;
}

/**
 * Whether ambience stays silenced after a sleep-timer ending. Music playing
 * clears it. Music that is paused while a sleep fade is (or was, in the
 * previous snapshot) running sets it: that is the timer completing (it clears
 * the fade flag and pauses in the same tick) or the listener pausing mid-fade,
 * and either way "keep ambience when paused" must not bring the rain back over
 * someone who has just fallen asleep.
 */
export function nextSleptOut(prev: SleepSnapshot, next: SleepSnapshot, sleptOut: boolean): boolean {
  if (next.isPlaying) return false;
  if (prev.sleepFading || next.sleepFading) return true;
  return sleptOut;
}
