import { act, render, screen } from '@testing-library/react-native';
import { SeekBar } from '@/components/player/SeekBar';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

const initialState = usePlayerStore.getState();

function track(extra: Partial<Track> = {}): Track {
  return {
    id: 't',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 144,
    filePath: 'file:///t.mp3',
    ...extra,
  };
}

const seekBy = jest.fn();

// The test library drops events on a view whose touch responder refuses (no
// layout width yet), so the screen reader action is sent to the handler directly.
function adjust(bar: ReturnType<typeof screen.getByLabelText>, actionName: string) {
  bar.props.onAccessibilityAction({ nativeEvent: { actionName } });
}

beforeEach(() => {
  usePlayerStore.setState(initialState, true);
  usePlayerStore.setState({ seekBy });
});

describe('SeekBar accessibility', () => {
  it('exposes the position as an adjustable value with a readable text', async () => {
    usePlayerStore.setState({ currentTrack: track(), currentTime: 61, duration: 144 });
    await render(<SeekBar />);

    const bar = screen.getByLabelText('Seek');
    expect(bar.props.accessibilityRole).toBe('adjustable');
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 144,
      now: 61,
      text: '1:01 of 2:24',
    });
  });

  it('steps ten seconds forward and back through the store', async () => {
    usePlayerStore.setState({ currentTrack: track(), currentTime: 61, duration: 144 });
    await render(<SeekBar />);

    const bar = screen.getByLabelText('Seek');
    await act(() => adjust(bar, 'increment'));
    await act(() => adjust(bar, 'decrement'));
    expect(seekBy.mock.calls).toEqual([[10], [-10]]);
  });

  it('offers no adjust actions before the duration is known', async () => {
    usePlayerStore.setState({ currentTrack: track(), currentTime: 0, duration: 0 });
    await render(<SeekBar />);

    const bar = screen.getByLabelText('Seek');
    expect(bar.props.accessibilityActions).toBeUndefined();
    await act(() => adjust(bar, 'increment'));
    expect(seekBy).not.toHaveBeenCalled();
  });

  it('shows a live stream as plain text, not an adjustable control', async () => {
    usePlayerStore.setState({ currentTrack: track({ isLive: true, duration: 0 }) });
    await render(<SeekBar />);

    expect(screen.queryByLabelText('Seek')).toBeNull();
    const live = screen.getByLabelText('Live stream');
    expect(live.props.accessibilityRole).toBeUndefined();
  });
});
