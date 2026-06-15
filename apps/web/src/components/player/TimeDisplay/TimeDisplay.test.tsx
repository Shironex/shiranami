import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { TimeDisplay } from './index';

const playbackState = vi.hoisted(() => ({ currentTime: 0 }));
const uiState = vi.hoisted(() => ({ scrubTime: null as number | null }));

vi.mock('@/stores/usePlaybackStore', () => {
  const hook = <T,>(selector: (s: typeof playbackState) => T) => selector(playbackState);
  return { usePlaybackStore: Object.assign(hook, { getState: () => playbackState }) };
});

vi.mock('@/stores/usePlayerUIStore', () => {
  const hook = <T,>(selector: (s: typeof uiState) => T) => selector(uiState);
  return { usePlayerUIStore: Object.assign(hook, { getState: () => uiState }) };
});

describe('TimeDisplay', () => {
  beforeEach(() => {
    playbackState.currentTime = 0;
    uiState.scrubTime = null;
  });

  it('formats the current playback time as mm:ss', () => {
    playbackState.currentTime = 83;
    const { container } = render(<TimeDisplay />);
    expect(container.textContent).toBe('1:23');
  });

  it('prefers the scrub time over the playback time while scrubbing', () => {
    playbackState.currentTime = 83;
    uiState.scrubTime = 12;
    const { container } = render(<TimeDisplay />);
    expect(container.textContent).toBe('0:12');
  });

  it('falls back to the playback time when scrub time is 0 (not null)', () => {
    playbackState.currentTime = 83;
    uiState.scrubTime = 0;
    const { container } = render(<TimeDisplay />);
    expect(container.textContent).toBe('0:00');
  });
});
