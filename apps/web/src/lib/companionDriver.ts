import {
  COMPANION_CAMEO_MS,
  COMPANION_GREETING_MS,
  COMPANION_LEVELUP_MS,
  COMPANION_RIPPLE_MS,
  COMPANION_SETTLE_MS,
  COMPANION_WAKE_MS,
  isLongCompanionAbsence,
  type CompanionEvent,
  type ICompanionInputs,
  type ICompanionMachineState,
} from '@/lib/companionMachine';
import { getCompanionApi } from '@/lib/companionBackend';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useViewStore } from '@/stores/useViewStore';
import { useUIStore } from '@/stores/useUIStore';
import { useLyricsAppearanceStore } from '@/stores/useLyricsAppearanceStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompanionStore, isCompanionSpecies } from '@/stores/useCompanionStore';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { useRecapStore } from '@/stores/useRecapStore';

/**
 * The companion's driver — the only writer into the runtime machine. It
 * derives reducer inputs from the app's stores, runs the temporal edges the
 * pure reducer cannot own (drowsy settle, wake one-shot, overlay windows),
 * drops to the static pose while the window is hidden, and syncs the durable
 * self from the ledger when the backend surface exists.
 *
 * Started lazily by the first mounted surface (`useCompanion`) and then left
 * running: a handful of store subscriptions and at most two pending timers —
 * nothing ticks while the machine is at rest, honoring the idle-0% budget.
 */

export interface ICompanionInputsSnapshot {
  enabled: boolean;
  playing: boolean;
  trackId: string | null;
  bpm: number | null;
  loudnessLufs: number | null;
  lyricsPresentation: 'list' | 'focus';
  rightPanel: 'lyrics' | 'queue' | null;
  activeView: string;
  nowPlayingPanel: 'lyrics' | 'queue' | 'eq' | null;
  /** Sleep-timer wind-down ending is active (`useSleepTimerStore.windDown`). */
  windDown: boolean;
  /** Overview's weekly recap card is on screen (`useRecapStore.cardVisible`). */
  recapVisible: boolean;
}

/** Pure input derivation — lyric focus only counts while a lyric surface shows. */
export function computeCompanionInputs(snapshot: ICompanionInputsSnapshot): ICompanionInputs {
  const lyricSurfaceShowing =
    snapshot.rightPanel === 'lyrics' ||
    (snapshot.activeView === 'now-playing' && snapshot.nowPlayingPanel === 'lyrics');
  return {
    enabled: snapshot.enabled,
    playing: snapshot.playing,
    trackId: snapshot.trackId,
    bpm: snapshot.bpm,
    loudnessLufs: snapshot.loudnessLufs,
    lyricFocus: snapshot.lyricsPresentation === 'focus' && lyricSurfaceShowing,
    windDown: snapshot.windDown,
    recapVisible: snapshot.recapVisible,
  };
}

function readCompanionInputs(): ICompanionInputs {
  const playback = usePlaybackStore.getState();
  const view = useViewStore.getState();
  const track = playback.currentTrack;
  return computeCompanionInputs({
    enabled: useInterfaceStore.getState().companion,
    playing: playback.isPlaying,
    trackId: track?.id ?? null,
    bpm: track?.bpm ?? null,
    loudnessLufs: track?.loudnessLufs ?? null,
    lyricsPresentation: useLyricsAppearanceStore.getState().lyricsPresentation,
    rightPanel: view.rightPanel,
    activeView: view.activeView,
    nowPlayingPanel: useUIStore.getState().nowPlayingPanel,
    windDown: useSleepTimerStore.getState().windDown,
    recapVisible: useRecapStore.getState().cardVisible,
  });
}

function inputsEqual(a: ICompanionInputs, b: ICompanionInputs): boolean {
  return (
    a.enabled === b.enabled &&
    a.playing === b.playing &&
    a.trackId === b.trackId &&
    a.bpm === b.bpm &&
    a.loudnessLufs === b.loudnessLufs &&
    a.lyricFocus === b.lyricFocus &&
    a.windDown === b.windDown &&
    a.recapVisible === b.recapVisible
  );
}

let started = false;
let unsubscribers: Array<() => void> = [];
let modeTimer: ReturnType<typeof setTimeout> | null = null;
let overlayTimer: ReturnType<typeof setTimeout> | null = null;

function dispatch(event: CompanionEvent): void {
  useCompanionRuntimeStore.getState().dispatch(event);
}

/** Re-arm the settle/wake and overlay timers on the transitions that need them. */
function syncTimers(prev: ICompanionMachineState, next: ICompanionMachineState): void {
  if (next.mode !== prev.mode) {
    if (modeTimer !== null) clearTimeout(modeTimer);
    modeTimer = null;
    if (next.mode === 'drowsy') {
      modeTimer = setTimeout(() => dispatch({ type: 'settled' }), COMPANION_SETTLE_MS);
    } else if (next.mode === 'waking') {
      modeTimer = setTimeout(() => dispatch({ type: 'woke' }), COMPANION_WAKE_MS);
    } else if (next.mode === 'greeting') {
      modeTimer = setTimeout(() => dispatch({ type: 'greeted' }), COMPANION_GREETING_MS);
    } else if (next.mode === 'recap-cameo') {
      modeTimer = setTimeout(() => dispatch({ type: 'cameo-done' }), COMPANION_CAMEO_MS);
    }
  }

  if (next.overlay !== prev.overlay || next.overlaySeq !== prev.overlaySeq) {
    if (overlayTimer !== null) clearTimeout(overlayTimer);
    overlayTimer = null;
    if (next.overlay !== null) {
      const windowMs = next.overlay === 'levelup' ? COMPANION_LEVELUP_MS : COMPANION_RIPPLE_MS;
      overlayTimer = setTimeout(() => dispatch({ type: 'overlay-done' }), windowMs);
    }
  }
}

function pushInputs(): void {
  const inputs = readCompanionInputs();
  if (inputsEqual(inputs, useCompanionRuntimeStore.getState().machine.inputs)) return;
  dispatch({ type: 'inputs', inputs });
}

function onVisibilityChange(): void {
  useCompanionRuntimeStore.getState().setSuspended(document.visibilityState === 'hidden');
}

/** Connect the ledger when the backend surface exists; stay local otherwise. */
function connectLedger(): void {
  const api = getCompanionApi();
  const { setLedger } = useCompanionRuntimeStore.getState();
  if (api === null) {
    setLedger({ hasBackend: false });
    return;
  }
  setLedger({ hasBackend: true });

  void api
    .getState()
    .then(state => {
      const runtime = useCompanionRuntimeStore.getState();
      runtime.dispatch({ type: 'stage-sync', stage: state.stage });
      runtime.setLedger({ name: state.name, xpHours: Math.floor(state.xp / 3600) });
      // The ledger's species wins when present — the local store is the fallback.
      if (isCompanionSpecies(state.species)) {
        useCompanionStore.getState().setSpecies(state.species);
      }
      // `lastSeenAt` is the *previous* sighting (get-state stamps the new one
      // after reading), so a long gap means the listener was genuinely away.
      if (isLongCompanionAbsence(state.lastSeenAt, Date.now())) {
        runtime.dispatch({ type: 'welcome-back' });
      }
    })
    .catch(() => {
      useCompanionRuntimeStore.getState().setLedger({ hasBackend: false });
    });

  unsubscribers.push(
    api.onXp(event => {
      const runtime = useCompanionRuntimeStore.getState();
      runtime.dispatch({ type: 'xp', stage: event.stage, leveledUp: event.leveledUp });
      runtime.setLedger({ xpHours: Math.floor(event.totalXp / 3600) });
    })
  );
}

export function ensureCompanionDriver(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  unsubscribers = [
    usePlaybackStore.subscribe(pushInputs),
    useViewStore.subscribe(pushInputs),
    useUIStore.subscribe(pushInputs),
    useLyricsAppearanceStore.subscribe(pushInputs),
    useInterfaceStore.subscribe(pushInputs),
    useSleepTimerStore.subscribe(pushInputs),
    useRecapStore.subscribe(pushInputs),
    useCompanionRuntimeStore.subscribe((state, prevState) => {
      syncTimers(prevState.machine, state.machine);
    }),
  ];

  document.addEventListener('visibilitychange', onVisibilityChange);
  unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

  pushInputs();
  onVisibilityChange();
  connectLedger();
}

/** Tear down every subscription and timer — tests and HMR only. */
export function stopCompanionDriver(): void {
  if (!started) return;
  started = false;
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  if (modeTimer !== null) clearTimeout(modeTimer);
  if (overlayTimer !== null) clearTimeout(overlayTimer);
  modeTimer = null;
  overlayTimer = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopCompanionDriver());
}
