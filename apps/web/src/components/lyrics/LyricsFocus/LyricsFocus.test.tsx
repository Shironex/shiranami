import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsFocus from './LyricsFocus';

const LINES: LyricLine[] = [
  { time: 0, text: 'line zero' },
  { time: 8, text: 'line one' },
  { time: 16, text: 'line two' },
  { time: 40, text: 'line three' }, // 24s instrumental gap before this
  { time: 48, text: 'line four' },
];

afterEach(() => {
  usePlaybackStore.setState({ currentTime: 0 });
  useUIStore.setState({ lowPerformanceMode: false });
});

describe('LyricsFocus', () => {
  it('renders only the focus window around the active line', () => {
    render(
      <LyricsFocus synced={LINES} activeLine={2} onLineClick={vi.fn()} syncedDimOpacity={0.45} />
    );

    expect(screen.getByRole('button', { name: 'line two' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'line zero' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'line four' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('narrows the window when asked (the sanctuary uses ±1)', () => {
    render(
      <LyricsFocus
        synced={LINES}
        activeLine={2}
        onLineClick={vi.fn()}
        syncedDimOpacity={0.45}
        windowSize={1}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'line zero' })).not.toBeInTheDocument();
  });

  it('keeps every line seekable, even blurred neighbours', () => {
    const onLineClick = vi.fn();
    render(
      <LyricsFocus
        synced={LINES}
        activeLine={2}
        onLineClick={onLineClick}
        syncedDimOpacity={0.45}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'line three' }));

    expect(onLineClick).toHaveBeenCalledExactlyOnceWith(40);
  });

  it('breathes the dots inside a ≥6s instrumental stretch', () => {
    usePlaybackStore.setState({ currentTime: 25 }); // inside the 16→40 gap
    const { container } = render(
      <LyricsFocus synced={LINES} activeLine={2} onLineClick={vi.fn()} syncedDimOpacity={0.45} />
    );

    expect(container.querySelector('[data-slot="breathing-dots"]')).not.toBeNull();
  });

  it('gives a fresh line its moment before reading the stretch as instrumental', () => {
    // Line three starts at 40; at 41 the 2.5s lead has not elapsed, so the
    // stage shows the line being sung, not the dots.
    usePlaybackStore.setState({ currentTime: 41 });
    const { container } = render(
      <LyricsFocus synced={LINES} activeLine={3} onLineClick={vi.fn()} syncedDimOpacity={0.45} />
    );

    expect(container.querySelector('[data-slot="breathing-dots"]')).toBeNull();
  });

  it('swaps blur for scale under low-performance mode', () => {
    useUIStore.setState({ lowPerformanceMode: true });
    const { container } = render(
      <LyricsFocus synced={LINES} activeLine={2} onLineClick={vi.fn()} syncedDimOpacity={0.45} />
    );

    expect(container.querySelector('[class*="blur-"]')).toBeNull();
  });
});
