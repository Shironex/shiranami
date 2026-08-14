import { beforeEach, describe, expect, it } from 'vitest';
import {
  useWindDownStore,
  shouldShowDriftNote,
  DRIFT_NOTE_MAX_AGE_MS,
  DRIFT_NOTE_MIN_AGE_MS,
  DEFAULT_WIND_DOWN_MINUTES,
  type WindDownCompletion,
  type WindDownLength,
} from './useWindDownStore';

function completionAt(at: string): WindDownCompletion {
  return { at, trackTitle: 'Drift' };
}

const NOW = new Date('2026-08-03T08:00:00.000Z').getTime();

describe('shouldShowDriftNote', () => {
  it('is false without a completion or once acknowledged', () => {
    expect(shouldShowDriftNote(null, false, NOW, NOW)).toBe(false);
    const lastNight = completionAt(new Date(NOW - 8 * 3600_000).toISOString());
    expect(shouldShowDriftNote(lastNight, true, NOW, NOW)).toBe(false);
  });

  it('shows a completion from before this launch (the next-launch case)', () => {
    const lastNight = completionAt(new Date(NOW - 8 * 3600_000).toISOString());
    // Launched this morning, drifted off last night.
    expect(shouldShowDriftNote(lastNight, false, NOW, NOW - 60_000)).toBe(true);
  });

  it('stays quiet right after completing in the still-open app, then shows in the morning', () => {
    const justNow = completionAt(new Date(NOW - 60_000).toISOString());
    const launchedYesterday = NOW - 12 * 3600_000;
    // One minute after the fade, same session: you're asleep, not returning.
    expect(shouldShowDriftNote(justNow, false, NOW, launchedYesterday)).toBe(false);

    // The same still-open app the next morning crosses the same-session floor.
    const morning = NOW + DRIFT_NOTE_MIN_AGE_MS;
    expect(shouldShowDriftNote(justNow, false, morning, launchedYesterday)).toBe(true);
  });

  it('goes quiet once the memory is older than the freshness cap', () => {
    const at = new Date(NOW - DRIFT_NOTE_MAX_AGE_MS - 1).toISOString();
    expect(shouldShowDriftNote(completionAt(at), false, NOW, NOW)).toBe(false);
  });

  it('rejects unparseable or future timestamps', () => {
    expect(shouldShowDriftNote({ at: 'not-a-date', trackTitle: null }, false, NOW, NOW)).toBe(
      false
    );
    const future = completionAt(new Date(NOW + 3600_000).toISOString());
    expect(shouldShowDriftNote(future, false, NOW, NOW)).toBe(false);
  });
});

describe('useWindDownStore', () => {
  beforeEach(() => {
    useWindDownStore.setState({
      lastCompletion: null,
      noteAcknowledged: false,
      closingLineUntil: null,
      lengthMinutes: DEFAULT_WIND_DOWN_MINUTES,
    });
  });

  it('recordCompletion stamps now, resets the acknowledgement, and cues the closing line', () => {
    useWindDownStore.getState().recordCompletion('Tokyo Rain');

    const s = useWindDownStore.getState();
    expect(s.lastCompletion?.trackTitle).toBe('Tokyo Rain');
    expect(Number.isNaN(new Date(s.lastCompletion!.at).getTime())).toBe(false);
    expect(s.noteAcknowledged).toBe(false);
    expect(s.closingLineUntil).toBeGreaterThan(Date.now());
  });

  it('acknowledgeDriftNote is permanent for the recorded completion', () => {
    useWindDownStore.getState().recordCompletion(null);
    useWindDownStore.getState().acknowledgeDriftNote();

    expect(useWindDownStore.getState().noteAcknowledged).toBe(true);
    expect(
      shouldShowDriftNote(
        useWindDownStore.getState().lastCompletion,
        useWindDownStore.getState().noteAcknowledged,
        Date.now()
      )
    ).toBe(false);
  });

  it('clearClosingLine drops only the transient line state', () => {
    useWindDownStore.getState().recordCompletion('Drift');
    useWindDownStore.getState().clearClosingLine();

    const s = useWindDownStore.getState();
    expect(s.closingLineUntil).toBeNull();
    expect(s.lastCompletion).not.toBeNull();
  });

  it('setLength stores every offered choice, including off', () => {
    for (const minutes of [0, 5, 10, 15, 20] as const) {
      useWindDownStore.getState().setLength(minutes);
      expect(useWindDownStore.getState().lengthMinutes).toBe(minutes);
    }
  });

  it('setLength falls back to the default for a value outside the choices', () => {
    useWindDownStore.getState().setLength(7 as WindDownLength);
    expect(useWindDownStore.getState().lengthMinutes).toBe(DEFAULT_WIND_DOWN_MINUTES);
  });
});
