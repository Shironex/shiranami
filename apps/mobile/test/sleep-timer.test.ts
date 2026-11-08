import { FADE_MS, fadeLevel, sleepLabel, sleepStep } from '@/lib/sleep-timer';
import { attachTransport, usePlayerStore, type PlayerTransport } from '@/stores/usePlayerStore';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';

const MIN = 60_000;

describe('sleep timer math', () => {
  it('keeps full level until the last two minutes', () => {
    expect(fadeLevel(3 * MIN, true)).toBe(1);
    expect(fadeLevel(FADE_MS, true)).toBe(1);
  });

  it('fades to silence over the last two minutes', () => {
    expect(fadeLevel(MIN, true)).toBeCloseTo(0.25);
    expect(fadeLevel(0, true)).toBe(0);
    expect(fadeLevel(30_000, true)).toBeLessThan(fadeLevel(60_000, true));
  });

  it('does not fade when the toggle is off', () => {
    expect(fadeLevel(10_000, false)).toBe(1);
  });

  it('expires at the end time, judged by the clock', () => {
    const endsAt = 1_000_000;
    expect(sleepStep(endsAt, endsAt - 1, true).expired).toBe(false);
    expect(sleepStep(endsAt, endsAt, true)).toEqual({ remaining: 0, level: 0, expired: true });
    expect(sleepStep(endsAt, endsAt + 5 * MIN, false).expired).toBe(true);
  });

  it('labels the remaining time in whole minutes, rounded up', () => {
    expect(sleepLabel(24 * MIN)).toBe('24 min');
    expect(sleepLabel(23 * MIN + 1)).toBe('24 min');
    expect(sleepLabel(10_000)).toBe('1 min');
  });
});

describe('sleep timer store', () => {
  const initialPlayer = usePlayerStore.getState();
  const initialTimer = useSleepTimerStore.getState();
  let transport: jest.Mocked<PlayerTransport>;
  let detach: () => void;
  const timer = () => useSleepTimerStore.getState();
  const player = () => usePlayerStore.getState();
  const track = {
    id: 't',
    title: 'Snowfall',
    artist: 'Idealism',
    album: '',
    duration: 144,
    filePath: 'file:///t.mp3',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    usePlayerStore.setState(initialPlayer, true);
    useSleepTimerStore.setState(initialTimer, true);
    transport = {
      load: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(),
      stop: jest.fn(),
      setVolume: jest.fn(),
    };
    detach = attachTransport(transport);
    player().playFromList([track], 0);
  });

  afterEach(() => {
    timer().cancel();
    detach();
    jest.useRealTimers();
  });

  it('stores the end as a wall-clock timestamp', () => {
    timer().start(30, true, 1_000);
    expect(timer().endsAt).toBe(1_000 + 30 * MIN);
  });

  it('fades the output during the last two minutes', () => {
    timer().start(30, true, 0);
    timer().check(29 * MIN);
    expect(player().fade).toBeCloseTo(0.25);
    expect(transport.setVolume).toHaveBeenLastCalledWith(expect.closeTo(0.2, 5));
  });

  it('pauses through the player once the clock passes the end, even after a long gap', () => {
    timer().start(15, true, 0);
    // The app was in the background for an hour; the first check after it
    // comes back still stops playback.
    timer().check(60 * MIN);
    expect(transport.pause).toHaveBeenCalled();
    expect(player().isPlaying).toBe(false);
    expect(player().fade).toBe(1);
    expect(timer().endsAt).toBeNull();
  });

  it('cancelling restores full level', () => {
    timer().start(30, true, 0);
    timer().check(29 * MIN);
    timer().cancel();
    expect(player().fade).toBe(1);
    expect(timer().remaining).toBe(0);
  });

  it('end of song: pauses when the track ends, then turns itself off', () => {
    timer().startEndOfTrack(false);
    expect(player().stopAfterCurrent).toBe(true);
    player()._onTrackEnd();
    expect(player().isPlaying).toBe(false);
    timer().check();
    expect(timer().endOfTrack).toBe(false);
  });

  it('ticks on its own interval', () => {
    const now = Date.now();
    timer().start(1, false, now);
    jest.setSystemTime(now + 61_000);
    jest.advanceTimersByTime(1_000);
    expect(transport.pause).toHaveBeenCalled();
  });
});
