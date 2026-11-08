import { act, renderHook } from '@testing-library/react-native';
import { useAppShortcuts } from '@/hooks/useAppShortcuts';
import { useLastPlayedStore } from '@/lib/last-played';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }));

const mockQuick: {
  initial: { id: string } | undefined;
  listener: ((a: { id: string }) => void) | null;
} = { initial: undefined, listener: null };
const mockSetItems = jest.fn(() => Promise.resolve());

jest.mock('expo-quick-actions', () => ({
  get initial() {
    return mockQuick.initial;
  },
  setItems: (...args: unknown[]) => (mockSetItems as (...a: unknown[]) => unknown)(...args),
  addListener: (listener: (a: { id: string }) => void) => {
    mockQuick.listener = listener;
    return { remove: jest.fn() };
  },
}));

jest.mock('expo-audio', () => ({}));
jest.mock('radio-browser-api', () => ({ RadioBrowserApi: jest.fn() }));

function track(id: string): Track {
  return { id, title: id, artist: 'A', album: 'B', duration: 100, filePath: `file:///${id}.mp3` };
}

const initial = usePlayerStore.getState();
const playFromList = jest.fn();
const playShuffled = jest.fn();

beforeEach(() => {
  mockQuick.initial = undefined;
  mockQuick.listener = null;
  usePlayerStore.setState({
    ...initial,
    library: [track('a'), track('b')],
    playFromList,
    playShuffled,
  });
  useLastPlayedStore.setState({ track: null, station: null, loaded: true });
});

describe('useAppShortcuts', () => {
  it('sets the dynamic shortcuts once data is ready, not before', async () => {
    const { rerender } = await renderHook(
      ({ loaded }: { loaded: boolean }) => useAppShortcuts(loaded),
      {
        initialProps: { loaded: false },
      }
    );
    expect(mockSetItems).not.toHaveBeenCalled();
    await rerender({ loaded: true });
    expect(mockSetItems).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'radio' }),
      expect.objectContaining({ id: 'shuffle' }),
    ]);
  });

  it('warm start: acts at once on a shortcut event', async () => {
    await renderHook(() => useAppShortcuts(true));
    await act(async () => mockQuick.listener?.({ id: 'shuffle' }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(playShuffled).toHaveBeenCalledWith(usePlayerStore.getState().library);
  });

  // Runs before the replay test: the initial shortcut is consumed once per module load.
  it('cold start: waits for the library, then acts exactly once', async () => {
    mockQuick.initial = { id: 'radio' };
    const { rerender } = await renderHook(
      ({ loaded }: { loaded: boolean }) => useAppShortcuts(loaded),
      {
        initialProps: { loaded: false },
      }
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    await rerender({ loaded: true });
    await rerender({ loaded: true });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/radio');
  });

  it('does not replay the initial shortcut when the layout mounts again', async () => {
    mockQuick.initial = { id: 'radio' };
    await renderHook(() => useAppShortcuts(true));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
