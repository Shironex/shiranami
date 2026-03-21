import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeekBar } from './SeekBar';

const mockState = vi.hoisted(() => ({
  duration: 100,
  scrubTime: null as number | null,
  isPlaying: false,
  currentTime: 0,
  seek: vi.fn(),
  setScrubTime: vi.fn(),
}));

vi.mock('@/stores/usePlayerStore', () => ({
  usePlayerStore: <T,>(selector: (s: typeof mockState) => T) => selector(mockState),
  currentTimeRef: { current: 0 },
}));

describe('SeekBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.duration = 100;
    mockState.scrubTime = null;
    mockState.isPlaying = false;
    mockState.currentTime = 0;
    mockState.seek.mockReset();
    mockState.setScrubTime.mockReset();
  });

  it('updates scrub position and seeks on pointer up', async () => {
    const user = userEvent.setup();
    render(<SeekBar />);
    const track = screen.getByRole('slider');

    Object.defineProperty(track, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 200,
        height: 8,
        top: 0,
        left: 0,
        bottom: 8,
        right: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await user.pointer({
      keys: '[MouseLeft>]',
      target: track,
      coords: { clientX: 100, clientY: 4 },
    });
    expect(mockState.setScrubTime).toHaveBeenCalledWith(50);

    await user.pointer({
      keys: '[/MouseLeft]',
      target: track,
      coords: { clientX: 150, clientY: 4 },
    });
    expect(mockState.seek).toHaveBeenCalledWith(75);
  });
});
