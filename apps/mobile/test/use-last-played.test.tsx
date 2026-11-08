import { act, renderHook } from '@testing-library/react-native';
import { useLastPlayed } from '@/hooks/useLastPlayed';
import { useLastPlayedStore } from '@/lib/last-played';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

const mockSaveLastTrack = jest.fn(() => Promise.resolve());

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));
jest.mock('@/lib/last-played', () => {
  const actual = jest.requireActual('@/lib/last-played');
  return {
    ...actual,
    loadLastPlayed: () => new Promise(() => undefined),
    saveLastTrack: (...args: unknown[]) =>
      (mockSaveLastTrack as (...a: unknown[]) => unknown)(...args),
    saveLastStation: () => Promise.resolve(),
  };
});
jest.mock('expo-audio', () => ({}));
jest.mock('radio-browser-api', () => ({ RadioBrowserApi: jest.fn() }));

function track(id: string): Track {
  return { id, title: id, artist: 'A', album: 'B', duration: 300, filePath: `file:///${id}.mp3` };
}

const initialPlayer = usePlayerStore.getState();

beforeEach(() => {
  mockSaveLastTrack.mockClear();
  usePlayerStore.setState(initialPlayer, true);
  useLastPlayedStore.setState({ track: { id: 'a', position: 120 }, station: null });
});

describe('useLastPlayed', () => {
  it('keeps the saved position when the saved track starts again', async () => {
    await renderHook(() => useLastPlayed());

    await act(async () => usePlayerStore.setState({ currentTrack: track('a'), currentTime: 0 }));

    expect(useLastPlayedStore.getState().track).toEqual({ id: 'a', position: 120 });
    expect(mockSaveLastTrack).not.toHaveBeenCalled();
  });

  it('starts a different track from the beginning', async () => {
    await renderHook(() => useLastPlayed());

    await act(async () => usePlayerStore.setState({ currentTrack: track('b'), currentTime: 0 }));

    expect(useLastPlayedStore.getState().track).toEqual({ id: 'b', position: 0 });
    expect(mockSaveLastTrack).toHaveBeenCalledWith({}, { id: 'b', position: 0 });
  });
});
