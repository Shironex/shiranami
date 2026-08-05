import { describe, expect, it } from 'vitest';
import {
  COMPANION_DEFAULT_INPUTS,
  GROOVING_MIN_BPM,
  GROOVING_MIN_LUFS,
  clampStage,
  companionReduce,
  createCompanionState,
  foldCompanionBpm,
  isCompanionVisible,
  qualifiesForGrooving,
  type CompanionEvent,
  type ICompanionInputs,
  type ICompanionMachineState,
} from './companionMachine';

function inputs(overrides: Partial<ICompanionInputs> = {}): ICompanionInputs {
  return { ...COMPANION_DEFAULT_INPUTS, ...overrides };
}

function feed(state: ICompanionMachineState, ...events: CompanionEvent[]): ICompanionMachineState {
  return events.reduce(companionReduce, state);
}

/** A machine mid-listen on a qualifying-for-nothing calm track. */
function listeningState(): ICompanionMachineState {
  return feed(createCompanionState(), {
    type: 'inputs',
    inputs: inputs({ playing: true, trackId: 'a', bpm: 80, loudnessLufs: -16 }),
  });
}

describe('createCompanionState', () => {
  it('starts idle with no track and nothing playing', () => {
    const state = createCompanionState();
    expect(state.mode).toBe('idle');
    expect(state.overlay).toBeNull();
    expect(state.stage).toBe(0);
  });

  it('starts hidden when the toggle is off', () => {
    expect(createCompanionState(inputs({ enabled: false })).mode).toBe('hidden');
  });

  it('starts sleeping when a paused track is already loaded', () => {
    expect(createCompanionState(inputs({ trackId: 'a' })).mode).toBe('sleeping');
  });
});

describe('listening and grooving', () => {
  it('listens while playing a calm track', () => {
    expect(listeningState().mode).toBe('listening');
  });

  it('grooves only when both tempo and loudness qualify', () => {
    const state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: 128, loudnessLufs: -9 }),
    });
    expect(state.mode).toBe('grooving');
  });

  it('stays listening on a fast but quiet track', () => {
    const state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: 128, loudnessLufs: -18 }),
    });
    expect(state.mode).toBe('listening');
  });

  it('stays listening on a loud but slow track', () => {
    const state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: 82, loudnessLufs: -8 }),
    });
    expect(state.mode).toBe('listening');
  });

  it('never grooves on an unanalysed track', () => {
    const state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: null, loudnessLufs: null }),
    });
    expect(state.mode).toBe('listening');
  });
});

describe('drowsy → sleeping → waking', () => {
  it('turns drowsy on pause, then sleeps only after the settle event', () => {
    let state = listeningState();
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: false, trackId: 'a', bpm: 80, loudnessLufs: -16 }),
    });
    expect(state.mode).toBe('drowsy');

    state = feed(state, { type: 'settled' });
    expect(state.mode).toBe('sleeping');
  });

  it('ignores a stray settle outside drowsy', () => {
    const state = listeningState();
    expect(feed(state, { type: 'settled' }).mode).toBe('listening');
  });

  it('wakes through the one-shot before listening again', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: false, trackId: 'a' }),
    });
    state = feed(state, { type: 'settled' });

    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: 80, loudnessLufs: -16 }),
    });
    expect(state.mode).toBe('waking');

    // Repeated input churn while waking must not restart or skip the one-shot.
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: 80, loudnessLufs: -16 }),
    });
    expect(state.mode).toBe('waking');

    state = feed(state, { type: 'woke' });
    expect(state.mode).toBe('listening');
  });

  it('wakes straight into grooving when the track qualifies', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: false, trackId: 'a' }),
    });
    state = feed(state, { type: 'settled' });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', bpm: 140, loudnessLufs: -9 }),
    });
    state = feed(state, { type: 'woke' });
    expect(state.mode).toBe('grooving');
  });

  it('settles back toward sleep when playback stops mid-wake', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: false, trackId: 'a' }),
    });
    state = feed(state, { type: 'settled' });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a' }),
    });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: false, trackId: 'a' }),
    });
    expect(feed(state, { type: 'woke' }).mode).toBe('drowsy');
  });

  it('returns to idle when the queue is cleared', () => {
    const state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: false, trackId: null }),
    });
    expect(state.mode).toBe('idle');
  });
});

describe('track-change ripple', () => {
  it('ripples on a track change', () => {
    const state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'b', bpm: 90, loudnessLufs: -14 }),
    });
    expect(state.overlay).toBe('ripple');
    expect(state.overlaySeq).toBe(1);
  });

  it('does not ripple for the very first track', () => {
    const state = listeningState();
    expect(state.overlay).toBeNull();
  });

  it('cancels and restarts (never queues) on rapid skips', () => {
    let state = listeningState();
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'b' }),
    });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'c' }),
    });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'd' }),
    });
    // Still exactly one active overlay; the bumped seq is the restart signal.
    expect(state.overlay).toBe('ripple');
    expect(state.overlaySeq).toBe(3);
  });

  it('clears the overlay on overlay-done', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'b' }),
    });
    state = feed(state, { type: 'overlay-done' });
    expect(state.overlay).toBeNull();
  });
});

describe('level-up deferral', () => {
  it('adopts a launch stage-sync silently, without celebration', () => {
    const state = feed(listeningState(), { type: 'stage-sync', stage: 3 });
    expect(state.stage).toBe(3);
    expect(state.overlay).toBeNull();
    expect(state.pendingStage).toBeNull();
  });

  it('never regresses the stage', () => {
    let state = feed(listeningState(), { type: 'stage-sync', stage: 3 });
    state = feed(state, { type: 'stage-sync', stage: 1 });
    expect(state.stage).toBe(3);
  });

  it('defers a mid-song level-up to the next track boundary', () => {
    let state = feed(listeningState(), { type: 'xp', stage: 1, leveledUp: true });
    expect(state.stage).toBe(0);
    expect(state.pendingStage).toBe(1);
    expect(state.overlay).toBeNull();

    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'b' }),
    });
    expect(state.stage).toBe(1);
    expect(state.pendingStage).toBeNull();
    expect(state.overlay).toBe('levelup');
  });

  it('celebrates at most once per session; later stages land as a plain ripple', () => {
    let state = feed(listeningState(), { type: 'xp', stage: 1, leveledUp: true });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'b' }),
    });
    state = feed(state, { type: 'overlay-done' });

    state = feed(state, { type: 'xp', stage: 2, leveledUp: true });
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'c' }),
    });
    expect(state.stage).toBe(2);
    expect(state.overlay).toBe('ripple');
  });

  it('an xp tick without a level crossing updates the stage silently', () => {
    const state = feed(listeningState(), { type: 'xp', stage: 1, leveledUp: false });
    expect(state.stage).toBe(1);
    expect(state.pendingStage).toBeNull();
    expect(state.overlay).toBeNull();
  });
});

describe('hiding and hidden', () => {
  it('hides during lyric focus and returns to the loop after', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', lyricFocus: true }),
    });
    expect(state.mode).toBe('hiding');

    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a' }),
    });
    expect(state.mode).toBe('listening');
  });

  it('lyric focus outranks grooving', () => {
    const state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({
        playing: true,
        trackId: 'a',
        bpm: 140,
        loudnessLufs: -8,
        lyricFocus: true,
      }),
    });
    expect(state.mode).toBe('hiding');
  });

  it('the master toggle unmounts everything, dropping any overlay', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'b' }),
    });
    expect(state.overlay).toBe('ripple');

    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ enabled: false, playing: true, trackId: 'b' }),
    });
    expect(state.mode).toBe('hidden');
    expect(state.overlay).toBeNull();
  });

  it('visibility helper: only hiding and hidden are invisible', () => {
    expect(isCompanionVisible('listening')).toBe(true);
    expect(isCompanionVisible('sleeping')).toBe(true);
    expect(isCompanionVisible('hiding')).toBe(false);
    expect(isCompanionVisible('hidden')).toBe(false);
  });
});

describe('grooving qualification helpers', () => {
  it('folds foreign BPM values into the calm band', () => {
    expect(foldCompanionBpm(220)).toBe(110);
    expect(foldCompanionBpm(55)).toBe(110);
    expect(foldCompanionBpm(180)).toBe(90);
    expect(foldCompanionBpm(null)).toBeNull();
    expect(foldCompanionBpm(0)).toBeNull();
    expect(foldCompanionBpm(20)).toBeNull();
    expect(foldCompanionBpm(400)).toBeNull();
  });

  it('applies both thresholds exactly at the boundary', () => {
    const at = inputs({ bpm: GROOVING_MIN_BPM, loudnessLufs: GROOVING_MIN_LUFS });
    const under = inputs({ bpm: GROOVING_MIN_BPM - 1, loudnessLufs: GROOVING_MIN_LUFS });
    const quiet = inputs({ bpm: GROOVING_MIN_BPM, loudnessLufs: GROOVING_MIN_LUFS - 0.1 });
    expect(qualifiesForGrooving(at)).toBe(true);
    expect(qualifiesForGrooving(under)).toBe(false);
    expect(qualifiesForGrooving(quiet)).toBe(false);
  });

  it('clamps stages into 0–4', () => {
    expect(clampStage(-2)).toBe(0);
    expect(clampStage(2)).toBe(2);
    expect(clampStage(9)).toBe(4);
    expect(clampStage(Number.NaN)).toBe(0);
  });
});
