/**
 * Companion state machine — the pure cadence behind Shio and Hotaru.
 *
 * One reducer, one active loop state, one-shot overlays riding on top
 * (`docs/v2/companion/research-visual.md` §Part 3). The reducer owns *when*
 * the pet changes state; it never touches pixels, timers, or the DOM — the
 * driver feeds it inputs and timer events, and the SVG rigs render whatever
 * mode it lands on. That split is what makes the cadence unit-testable.
 *
 * Deliberate placements (not omissions):
 * - Peek (hover) is an overlay on any visible loop and never changes the
 *   loop itself, so it lives at the perch surface as local hover state.
 * - Sanctuary chrome visibility only affects how the sanctuary cameo fades,
 *   so the sanctuary surface reads `chromeVisible` directly.
 * - Humming, the wind-down yawn, and the recap cameo are Phase 3: their
 *   modes are typed below so surfaces can already switch over them, but no
 *   transition produces them yet.
 */

export type CompanionSpecies = 'shio' | 'hotaru';

/** Stage index 0–4 (I–V). Mirrors the Rust ledger's monotonic `stage` column. */
export type CompanionStage = 0 | 1 | 2 | 3 | 4;

export type CompanionMode =
  | 'idle'
  | 'listening'
  | 'grooving'
  | 'drowsy'
  | 'sleeping'
  | 'waking'
  | 'hiding'
  | 'hidden'
  // Phase 3 stubs — typed for exhaustive switches, never produced this phase.
  | 'humming'
  | 'wind-down-yawn'
  | 'recap-cameo';

/** One-shot celebrations layered over the active loop. */
export type CompanionOverlay = 'ripple' | 'levelup';

export interface ICompanionInputs {
  /** Master toggle (`useInterfaceStore.companion`). */
  readonly enabled: boolean;
  readonly playing: boolean;
  readonly trackId: string | null;
  /** Stored BPM (analyzer-folded into 60–180); null = unanalysed. */
  readonly bpm: number | null;
  /** Integrated loudness (LUFS); null = unanalysed. */
  readonly loudnessLufs: number | null;
  /** Lyric focus presentation is showing — text is the event, the pet hides. */
  readonly lyricFocus: boolean;
}

export interface ICompanionMachineState {
  readonly mode: CompanionMode;
  readonly overlay: CompanionOverlay | null;
  /**
   * Bumped every time an overlay (re)starts, so a ripple arriving while a
   * ripple is mid-flight restarts the animation — cancel, never queue.
   */
  readonly overlaySeq: number;
  readonly inputs: ICompanionInputs;
  readonly stage: CompanionStage;
  /** Stage reached in the ledger but not yet shown — released at the next track boundary. */
  readonly pendingStage: CompanionStage | null;
  /** The level-up celebration plays at most once per session. */
  readonly celebratedThisSession: boolean;
}

export type CompanionEvent =
  /** Store-derived inputs changed (playback, lyric focus, toggle, track). */
  | { type: 'inputs'; inputs: ICompanionInputs }
  /** The drowsy settle window elapsed. */
  | { type: 'settled' }
  /** The waking one-shot finished. */
  | { type: 'woke' }
  /** The active overlay's window elapsed. */
  | { type: 'overlay-done' }
  /** Ledger read at launch — adopt silently, no celebration. */
  | { type: 'stage-sync'; stage: number }
  /** Live `companion:xp` event from the ledger. */
  | { type: 'xp'; stage: number; leveledUp: boolean };

/** Drowsy → sleeping settle window (ms). */
export const COMPANION_SETTLE_MS = 1500;
/** Waking squash-and-stretch one-shot (ms). */
export const COMPANION_WAKE_MS = 800;
/** Track-change ripple window (ms). */
export const COMPANION_RIPPLE_MS = 1200;
/** Level-up celebration window (ms). */
export const COMPANION_LEVELUP_MS = 3000;

/** Grooving needs tempo: folded BPM at or above this. */
export const GROOVING_MIN_BPM = 110;
/**
 * Grooving needs energy: integrated loudness at or above this. A fixed line
 * for now — TODO(companion): replace with the library's median loudness once
 * a cheap aggregate exists (research-visual Part 3 wants "above library median").
 */
export const GROOVING_MIN_LUFS = -11;

const STAGE_MAX: CompanionStage = 4;

export function clampStage(stage: number): CompanionStage {
  if (!Number.isFinite(stage)) return 0;
  const rounded = Math.round(stage);
  if (rounded <= 0) return 0;
  if (rounded >= STAGE_MAX) return STAGE_MAX;
  return rounded as CompanionStage;
}

/**
 * Fold a BPM into the calm band by octaves, mirroring the analyzer's own
 * 60–180 fold — a defensive re-fold so a foreign row can't strobe the pet.
 * Null for absent/implausible values.
 */
export function foldCompanionBpm(bpm: number | null | undefined): number | null {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return null;
  if (bpm < 30 || bpm > 300) return null;
  let folded = bpm;
  while (folded < 60) folded *= 2;
  while (folded >= 180) folded /= 2;
  return folded;
}

/** High tempo AND a genuinely loud track — the grooving qualification. */
export function qualifiesForGrooving(inputs: ICompanionInputs): boolean {
  const folded = foldCompanionBpm(inputs.bpm);
  if (folded === null || folded < GROOVING_MIN_BPM) return false;
  return inputs.loudnessLufs !== null && inputs.loudnessLufs >= GROOVING_MIN_LUFS;
}

export const COMPANION_DEFAULT_INPUTS: ICompanionInputs = {
  enabled: true,
  playing: false,
  trackId: null,
  bpm: null,
  loudnessLufs: null,
  lyricFocus: false,
};

export function createCompanionState(
  inputs: ICompanionInputs = COMPANION_DEFAULT_INPUTS
): ICompanionMachineState {
  return {
    mode: deriveRestingMode(inputs),
    overlay: null,
    overlaySeq: 0,
    inputs,
    stage: 0,
    pendingStage: null,
    celebratedThisSession: false,
  };
}

/** The mode a fresh machine (no temporal history) settles into. */
function deriveRestingMode(inputs: ICompanionInputs): CompanionMode {
  if (!inputs.enabled) return 'hidden';
  if (inputs.lyricFocus) return 'hiding';
  if (inputs.playing) return qualifiesForGrooving(inputs) ? 'grooving' : 'listening';
  return inputs.trackId === null ? 'idle' : 'sleeping';
}

function reduceInputs(
  state: ICompanionMachineState,
  inputs: ICompanionInputs
): ICompanionMachineState {
  if (!inputs.enabled) {
    return { ...state, inputs, mode: 'hidden', overlay: null };
  }

  let overlay = state.overlay;
  let overlaySeq = state.overlaySeq;
  let stage = state.stage;
  let pendingStage = state.pendingStage;
  let celebratedThisSession = state.celebratedThisSession;

  // ── Track boundary ───────────────────────────────────────────────────────
  const trackChanged = inputs.trackId !== state.inputs.trackId;
  if (trackChanged && inputs.trackId !== null) {
    if (pendingStage !== null) {
      // The deferred level-up releases here — never mid-song. The form always
      // updates; the celebration itself plays at most once per session.
      stage = pendingStage;
      pendingStage = null;
      overlay = celebratedThisSession ? 'ripple' : 'levelup';
      celebratedThisSession = true;
      overlaySeq++;
    } else if (state.inputs.trackId !== null) {
      // Replaces any in-flight overlay outright — cancel, never queue, so
      // five fast skips restart one ripple instead of stacking five.
      overlay = 'ripple';
      overlaySeq++;
    }
  }

  // ── Active loop ──────────────────────────────────────────────────────────
  let mode: CompanionMode;
  if (inputs.lyricFocus) {
    mode = 'hiding';
  } else if (inputs.playing) {
    if (state.mode === 'sleeping' || state.mode === 'drowsy') {
      mode = 'waking';
    } else if (state.mode === 'waking') {
      mode = 'waking';
    } else {
      mode = qualifiesForGrooving(inputs) ? 'grooving' : 'listening';
    }
  } else if (inputs.trackId === null) {
    mode = 'idle';
  } else if (state.mode === 'sleeping' || state.mode === 'drowsy') {
    mode = state.mode;
  } else {
    mode = 'drowsy';
  }

  return {
    ...state,
    inputs,
    mode,
    overlay,
    overlaySeq,
    stage,
    pendingStage,
    celebratedThisSession,
  };
}

export function companionReduce(
  state: ICompanionMachineState,
  event: CompanionEvent
): ICompanionMachineState {
  switch (event.type) {
    case 'inputs':
      return reduceInputs(state, event.inputs);

    case 'settled':
      if (state.mode !== 'drowsy') return state;
      return { ...state, mode: 'sleeping' };

    case 'woke': {
      if (state.mode !== 'waking') return state;
      const mode = state.inputs.playing
        ? qualifiesForGrooving(state.inputs)
          ? 'grooving'
          : 'listening'
        : 'drowsy';
      return { ...state, mode };
    }

    case 'overlay-done':
      if (state.overlay === null) return state;
      return { ...state, overlay: null };

    case 'stage-sync': {
      // Stages never regress (Finch rule) — adopt only upward, silently.
      const stage = clampStage(event.stage);
      if (stage <= state.stage) return state;
      return { ...state, stage };
    }

    case 'xp': {
      const stage = clampStage(event.stage);
      if (stage <= state.stage) return state;
      if (!event.leveledUp) return { ...state, stage };
      // Defer the reveal to the next track boundary — never mid-song.
      return { ...state, pendingStage: stage };
    }
  }
}

/** Loop states that render a visible sprite (peek may overlay these). */
export function isCompanionVisible(mode: CompanionMode): boolean {
  return mode !== 'hidden' && mode !== 'hiding';
}
