import { describe, expect, it } from 'vitest';
import {
  COMPANION_DEFAULT_INPUTS,
  GROOVING_MIN_BPM,
  GROOVING_MIN_LUFS,
  HUMMING_MAX_BPM,
  HUMMING_MAX_LUFS,
  clampStage,
  companionReduce,
  createCompanionState,
  foldCompanionBpm,
  isCompanionVisible,
  isLongCompanionAbsence,
  qualifiesForGrooving,
  qualifiesForHumming,
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

describe('humming', () => {
  /** Playing inputs for a genuinely soft record: slow AND quiet. */
  const soft = () =>
    inputs({ playing: true, trackId: 'a', bpm: HUMMING_MAX_BPM, loudnessLufs: HUMMING_MAX_LUFS });

  it('hums while playing a slow, quiet track', () => {
    const state = feed(createCompanionState(), { type: 'inputs', inputs: soft() });
    expect(state.mode).toBe('humming');
  });

  it('needs both calm tempo and hush — one alone is plain listening', () => {
    expect(qualifiesForHumming(soft())).toBe(true);
    expect(qualifiesForHumming({ ...soft(), bpm: HUMMING_MAX_BPM + 1 })).toBe(false);
    expect(qualifiesForHumming({ ...soft(), loudnessLufs: HUMMING_MAX_LUFS + 0.1 })).toBe(false);
    expect(qualifiesForHumming({ ...soft(), bpm: null })).toBe(false);
    expect(qualifiesForHumming({ ...soft(), loudnessLufs: null })).toBe(false);
  });

  it('wakes into humming when the loaded track is soft', () => {
    let state = feed(createCompanionState(inputs({ trackId: 'a' })), {
      type: 'inputs',
      inputs: soft(),
    });
    expect(state.mode).toBe('waking');
    state = feed(state, { type: 'woke' });
    expect(state.mode).toBe('humming');
  });
});

describe('wind-down yawn', () => {
  it('yawns while the wind-down plays, whatever the tempo says', () => {
    const state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({
        playing: true,
        trackId: 'a',
        bpm: GROOVING_MIN_BPM,
        loudnessLufs: GROOVING_MIN_LUFS,
        windDown: true,
      }),
    });
    expect(state.mode).toBe('wind-down-yawn');
  });

  it('returns to the tempo loop when the wind-down is cancelled', () => {
    let state = feed(createCompanionState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', windDown: true }),
    });
    expect(state.mode).toBe('wind-down-yawn');
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a' }),
    });
    expect(state.mode).toBe('listening');
  });

  it('does not yawn while paused — silence settles toward sleep as always', () => {
    let state = listeningState();
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ trackId: 'a', bpm: 80, loudnessLufs: -16, windDown: true }),
    });
    expect(state.mode).toBe('drowsy');
  });
});

describe('recap cameo', () => {
  it('plays on the rising edge of the recap card, then hands back to the loop', () => {
    let state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({
        playing: true,
        trackId: 'a',
        bpm: 80,
        loudnessLufs: -16,
        recapVisible: true,
      }),
    });
    expect(state.mode).toBe('recap-cameo');

    // The cameo holds against input churn while the card stays up…
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', recapVisible: true }),
    });
    expect(state.mode).toBe('recap-cameo');

    // …and the timer hands the loop back.
    state = feed(state, { type: 'cameo-done' });
    expect(state.mode).toBe('listening');
  });

  it('cameos once per reveal — a still-visible card is not a new edge', () => {
    let state = feed(
      listeningState(),
      {
        type: 'inputs',
        inputs: inputs({ playing: true, trackId: 'a', recapVisible: true }),
      },
      { type: 'cameo-done' }
    );
    expect(state.mode).toBe('listening');

    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', recapVisible: true, bpm: 90 }),
    });
    expect(state.mode).toBe('listening');
  });

  it('lets a sleeping resident sleep through its own report card', () => {
    let state = createCompanionState(inputs({ trackId: 'a' }));
    expect(state.mode).toBe('sleeping');
    state = feed(state, {
      type: 'inputs',
      inputs: inputs({ trackId: 'a', recapVisible: true }),
    });
    expect(state.mode).toBe('sleeping');
  });

  it('lyric focus outranks the cameo', () => {
    const state = feed(listeningState(), {
      type: 'inputs',
      inputs: inputs({ playing: true, trackId: 'a', recapVisible: true, lyricFocus: true }),
    });
    expect(state.mode).toBe('hiding');
  });
});

describe('welcome-back greeting', () => {
  it('greets from any visible mode and settles back to the loop', () => {
    let state = createCompanionState(inputs({ trackId: 'a' }));
    expect(state.mode).toBe('sleeping');
    state = feed(state, { type: 'welcome-back' });
    expect(state.mode).toBe('greeting');

    // Inputs keep flowing beneath the one-shot without breaking it.
    state = feed(state, { type: 'inputs', inputs: inputs({ trackId: 'a' }) });
    expect(state.mode).toBe('greeting');

    state = feed(state, { type: 'greeted' });
    expect(state.mode).toBe('drowsy');
  });

  it('never greets a hidden or hiding resident', () => {
    const hidden = feed(createCompanionState(inputs({ enabled: false })), {
      type: 'welcome-back',
    });
    expect(hidden.mode).toBe('hidden');

    const hiding = feed(
      createCompanionState(inputs({ playing: true, trackId: 'a', lyricFocus: true })),
      { type: 'welcome-back' }
    );
    expect(hiding.mode).toBe('hiding');
  });

  it('a stray greeted outside the greeting is ignored', () => {
    const state = feed(listeningState(), { type: 'greeted' });
    expect(state.mode).toBe('listening');
  });

  it('measures the absence from the previous sighting only', () => {
    const now = Date.parse('2026-08-14T12:00:00.000Z');
    expect(isLongCompanionAbsence('2026-08-13T11:59:00.000Z', now)).toBe(true);
    expect(isLongCompanionAbsence('2026-08-13T12:01:00.000Z', now)).toBe(false);
    expect(isLongCompanionAbsence(null, now)).toBe(false);
    expect(isLongCompanionAbsence('not-a-date', now)).toBe(false);
    // A clock that ran backwards is not an absence.
    expect(isLongCompanionAbsence('2026-08-20T12:00:00.000Z', now)).toBe(false);
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
