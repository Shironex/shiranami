import type { AudioStatus } from 'expo-audio';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { startPlaybackService, stopPlaybackService } from '@/lib/playback-service';

type StatusListener = (status: AudioStatus) => void;

const mockPlayer = {
  listener: null as StatusListener | null,
  volume: 1,
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
  remove: jest.fn(),
  setActiveForLockScreen: jest.fn(),
  addListener: jest.fn((_event: string, listener: StatusListener) => {
    mockPlayer.listener = listener;
    return { remove: jest.fn() };
  }),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  requestNotificationPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
}));

const mockNoisy = { listener: null as (() => void) | null, remove: jest.fn() };

jest.mock('@/modules/audio-noisy', () => ({
  addBecomingNoisyListener: jest.fn((listener: () => void) => {
    mockNoisy.listener = listener;
    return mockNoisy.remove;
  }),
}));

const { createAudioPlayer, setAudioModeAsync } = jest.requireMock('expo-audio');

const initialState = usePlayerStore.getState();
const store = () => usePlayerStore.getState();

function track(id: string, extra: Partial<Track> = {}): Track {
  return {
    id,
    title: id,
    artist: 'Artist',
    album: 'Album',
    duration: 200,
    filePath: `file:///${id}.mp3`,
    ...extra,
  };
}

function status(extra: Partial<AudioStatus> = {}): AudioStatus {
  return {
    id: 'player',
    currentTime: 0,
    playbackState: 'ready',
    timeControlStatus: 'playing',
    reasonForWaitingToPlay: '',
    mute: false,
    duration: 200,
    playing: true,
    loop: false,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: true,
    playbackRate: 1,
    shouldCorrectPitch: true,
    isLive: false,
    error: null,
    ...extra,
  } as AudioStatus;
}

const emit = (extra: Partial<AudioStatus> = {}) => mockPlayer.listener?.(status(extra));

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.listener = null;
  mockPlayer.volume = 1;
  usePlayerStore.setState(initialState, true);
  startPlaybackService();
});

afterEach(() => stopPlaybackService());

describe('playback service', () => {
  it('creates one player and sets a background, focus taking audio mode', () => {
    startPlaybackService();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' })
    );
  });

  it('starts the player at the store volume, not its own default', () => {
    expect(mockPlayer.volume).toBe(store().volume);
  });

  it('loads and plays the track the store picks', () => {
    const a = track('a');
    store().playFromList([a], 0);
    expect(mockPlayer.replace).toHaveBeenCalledWith(expect.objectContaining({ uri: a.filePath }));
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  it('forwards pause and seek to the player', () => {
    store().playFromList([track('a')], 0);
    store().pause();
    store().seek(42);
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(42);
  });

  it('mirrors position, duration, playing and buffering into the store', () => {
    store().playFromList([track('a')], 0);
    emit({ currentTime: 12.5, duration: 201, playing: false, isBuffering: true });

    expect(store().currentTime).toBe(12.5);
    expect(store().duration).toBe(201);
    expect(store().isPlaying).toBe(false);
    expect(store().isLoading).toBe(true);
  });

  it('advances to the next track when one ends', () => {
    const [a, b] = [track('a'), track('b')];
    store().playFromList([a, b], 0);
    emit({ didJustFinish: true, playing: false });

    expect(store().currentTrack?.id).toBe('b');
    expect(mockPlayer.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ uri: b.filePath })
    );
  });

  it('reports no position or duration for a live stream', () => {
    store().playFromList([track('radio', { isLive: true, duration: 0 })], 0);
    emit({ currentTime: 300, duration: 0, isLive: true });

    expect(store().currentTime).toBe(0);
    expect(store().duration).toBe(0);
  });

  it('stores the player error', () => {
    store().playFromList([track('a')], 0);
    emit({ error: 'Source error', playing: false });
    expect(store().error).toBe('Source error');
  });

  it('shows the track on the lock screen with seek buttons', () => {
    store().playFromList([track('a', { albumArt: 'https://art/a.jpg' })], 0);
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenLastCalledWith(
      true,
      { title: 'a', artist: 'Artist', albumTitle: 'Album', artworkUrl: 'https://art/a.jpg' },
      { isLiveStream: false, showSeekForward: true, showSeekBackward: true }
    );
  });

  it('marks radio as live on the lock screen and hides seeking', () => {
    store().playFromList([track('radio', { isLive: true, duration: 0 })], 0);
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenLastCalledWith(true, expect.anything(), {
      isLiveStream: true,
      showSeekForward: false,
      showSeekBackward: false,
    });
  });

  it('syncs a pause from the lock screen back into the store', () => {
    store().playFromList([track('a')], 0);
    emit({ playing: false, currentTime: 30 });
    expect(store().isPlaying).toBe(false);
  });

  it('clears the lock screen when the queue is cleared', () => {
    store().playFromList([track('a')], 0);
    store().clearQueue();
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenLastCalledWith(false);
  });

  it('pauses when headphones are unplugged', () => {
    store().playFromList([track('a')], 0);
    mockNoisy.listener?.();
    expect(store().isPlaying).toBe(false);
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('releases the player and stops driving it once stopped', () => {
    stopPlaybackService();
    expect(mockPlayer.remove).toHaveBeenCalled();
    expect(mockNoisy.remove).toHaveBeenCalled();
    store().playFromList([track('a')], 0);
    expect(mockPlayer.replace).not.toHaveBeenCalled();
  });
});
