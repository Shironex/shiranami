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
 * - Humming, the wind-down yawn and the recap cameo (Phase 3) are loop/one-shot
 *   modes produced here; the welcome-back greeting joins them as the launch
 *   one-shot after a long absence (`isLongCompanionAbsence` + `welcome-back`).
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
  // Phase 3 depth: the calm-playback loop, the sleep-timer wind-down loop,
  // and the recap one-shot.
  | 'humming'
  | 'wind-down-yawn'
  | 'recap-cameo'
  // Welcome-back one-shot at launch, after a long absence.
  | 'greeting';

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
  /** Sleep-timer wind-down ending is active — the pet yawns along. */
  readonly windDown: boolean;
  /** Overview's weekly recap card is on screen — cameo on its rising edge. */
  readonly recapVisible: boolean;
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
  | { type: 'xp'; stage: number; leveledUp: boolean }
  /** Launch after a long absence (`isLongCompanionAbsence`) — a brief wave. */
  | { type: 'welcome-back' }
  /** The greeting one-shot finished. */
  | { type: 'greeted' }
  /** The recap cameo window elapsed. */
  | { type: 'cameo-done' };

/** Drowsy → sleeping settle window (ms). */
export const COMPANION_SETTLE_MS = 1500;
/** Waking squash-and-stretch one-shot (ms). */
export const COMPANION_WAKE_MS = 800;
/** Track-change ripple window (ms). */
export const COMPANION_RIPPLE_MS = 1200;
/** Level-up celebration window (ms). */
export const COMPANION_LEVELUP_MS = 3000;
/** Welcome-back greeting one-shot (ms). */
export const COMPANION_GREETING_MS = 2600;
/** Recap cameo window (ms). */
export const COMPANION_CAMEO_MS = 6000;

/** An absence at least this long earns the welcome-back greeting at launch. */
export const COMPANION_WELCOME_BACK_HOURS = 24;

/**
 * Whether the gap since the previous sighting earns a greeting. Pure over the
 * ledger's `lastSeenAt` (the *previous* sighting — `get-state` stamps the new
 * one after reading): null (first ever read) and unparseable instants are not
 * absences, and neither is a clock that ran backwards.
 */
export function isLongCompanionAbsence(lastSeenAt: string | null, nowMs: number): boolean {
  if (lastSeenAt === null) return false;
  const seenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(seenMs)) return false;
  const away = nowMs - seenMs;
  return away >= COMPANION_WELCOME_BACK_HOURS * 60 * 60 * 1000;
}

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

/** Humming needs calm: folded BPM at or below this. */
export const HUMMING_MAX_BPM = 85;
/**
 * Humming needs hush: integrated loudness at or below this. Mirrors the
 * grooving line from the quiet side, leaving a plain-listening band between —
 * humming should stay an event for the genuinely soft records, not a uniform.
 */
export const HUMMING_MAX_LUFS = -18;

/** Low tempo AND a genuinely quiet track — the humming qualification. */
export function qualifiesForHumming(inputs: ICompanionInputs): boolean {
  const folded = foldCompanionBpm(inputs.bpm);
  if (folded === null || folded > HUMMING_MAX_BPM) return false;
  return inputs.loudnessLufs !== null && inputs.loudnessLufs <= HUMMING_MAX_LUFS;
}

export const COMPANION_DEFAULT_INPUTS: ICompanionInputs = {
  enabled: true,
  playing: false,
  trackId: null,
  bpm: null,
  loudnessLufs: null,
  lyricFocus: false,
  windDown: false,
  recapVisible: false,
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

/**
 * The loop while music actually plays: the wind-down yawn outranks tempo —
 * the room is being put to bed — then the track decides between grooving,
 * humming and plain listening.
 */
function playingLoopMode(inputs: ICompanionInputs): CompanionMode {
  if (inputs.windDown) return 'wind-down-yawn';
  if (qualifiesForGrooving(inputs)) return 'grooving';
  if (qualifiesForHumming(inputs)) return 'humming';
  return 'listening';
}

/** The loop a finished one-shot (wake, greeting, cameo) hands back to. */
function loopAfterOneShot(inputs: ICompanionInputs): CompanionMode {
  if (inputs.playing) return playingLoopMode(inputs);
  return inputs.trackId === null ? 'idle' : 'drowsy';
}

/** The mode a fresh machine (no temporal history) settles into. */
function deriveRestingMode(inputs: ICompanionInputs): CompanionMode {
  if (!inputs.enabled) return 'hidden';
  if (inputs.lyricFocus) return 'hiding';
  if (inputs.playing) return playingLoopMode(inputs);
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
  } else if (state.mode === 'greeting' || state.mode === 'recap-cameo') {
    // One-shots hold against input churn; their timer event releases them.
    mode = state.mode;
  } else if (inputs.playing) {
    if (state.mode === 'sleeping' || state.mode === 'drowsy') {
      mode = 'waking';
    } else if (state.mode === 'waking') {
      mode = 'waking';
    } else {
      mode = playingLoopMode(inputs);
    }
  } else if (inputs.trackId === null) {
    mode = 'idle';
  } else if (state.mode === 'sleeping' || state.mode === 'drowsy') {
    mode = state.mode;
  } else {
    mode = 'drowsy';
  }

  // ── Recap cameo ──────────────────────────────────────────────────────────
  // Rising edge only — the pet glances in when the recap card first appears,
  // once per reveal, and only from an awake loop: a sleeping resident sleeps
  // through its own report card.
  if (
    inputs.recapVisible &&
    !state.inputs.recapVisible &&
    (mode === 'idle' || mode === 'listening' || mode === 'grooving' || mode === 'humming')
  ) {
    mode = 'recap-cameo';
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
      return { ...state, mode: loopAfterOneShot(state.inputs) };
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

    case 'welcome-back':
      // Only a visible resident greets — hidden and hiding have no one to
      // wave at, and a second greeting mid-greeting just restarts nothing.
      if (!isCompanionVisible(state.mode) || state.mode === 'greeting') return state;
      return { ...state, mode: 'greeting' };

    case 'greeted':
      if (state.mode !== 'greeting') return state;
      return { ...state, mode: loopAfterOneShot(state.inputs) };

    case 'cameo-done':
      if (state.mode !== 'recap-cameo') return state;
      return { ...state, mode: loopAfterOneShot(state.inputs) };
  }
}

/** Loop states that render a visible sprite (peek may overlay these). */
export function isCompanionVisible(mode: CompanionMode): boolean {
  return mode !== 'hidden' && mode !== 'hiding';
}
