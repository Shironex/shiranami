import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import {
  LYRICS_ANIMATION_DEFAULT,
  useLyricsAppearanceStore,
} from '@/stores/useLyricsAppearanceStore';
import type { ILyricLineButtonProps } from './LyricLineButton.types';

import LyricLineButton from './LyricLineButton';

const CLASSES = {
  baseClassName: 'lyric-base',
  activeClassName: 'lyric-active',
  pastClassName: 'lyric-past',
  idleClassName: 'lyric-idle',
};

function makeProps(overrides: Partial<ILyricLineButtonProps> = {}): ILyricLineButtonProps {
  return {
    text: 'A quiet morning hum',
    time: 4,
    isActive: false,
    isPast: false,
    onSelect: vi.fn(),
    ...CLASSES,
    ...overrides,
  };
}

describe('LyricLineButton', () => {
  it('renders the lyric text as the button accessible name', () => {
    render(<LyricLineButton {...makeProps()} />);

    expect(screen.getByRole('button', { name: 'A quiet morning hum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A quiet morning hum' })).toHaveAttribute(
      'type',
      'button'
    );
  });

  it('applies the idle classes when the line has not played yet', () => {
    render(<LyricLineButton {...makeProps()} />);

    const button = screen.getByRole('button', { name: 'A quiet morning hum' });
    expect(button).toHaveClass('lyric-base', 'lyric-idle');
    expect(button).not.toHaveClass('lyric-active');
    expect(button).not.toHaveClass('lyric-past');
  });

  it('applies the active classes for the line currently being sung', () => {
    render(<LyricLineButton {...makeProps({ isActive: true })} />);

    const button = screen.getByRole('button', { name: 'A quiet morning hum' });
    expect(button).toHaveClass('lyric-base', 'lyric-active');
    expect(button).not.toHaveClass('lyric-idle');
  });

  it('applies the past classes for a line that already played', () => {
    render(<LyricLineButton {...makeProps({ isPast: true })} />);

    const button = screen.getByRole('button', { name: 'A quiet morning hum' });
    expect(button).toHaveClass('lyric-base', 'lyric-past');
    expect(button).not.toHaveClass('lyric-idle');
  });

  it('seeks to the line timestamp when clicked', () => {
    const onSelect = vi.fn();
    render(<LyricLineButton {...makeProps({ time: 12, onSelect })} />);

    fireEvent.click(screen.getByRole('button', { name: 'A quiet morning hum' }));

    expect(onSelect).toHaveBeenCalledWith(12);
  });

  it('attaches the active ref only while the line is active', () => {
    const activeRef = createRef<HTMLButtonElement>();
    const { rerender } = render(<LyricLineButton {...makeProps({ isActive: true, activeRef })} />);

    expect(activeRef.current).toBe(screen.getByRole('button', { name: 'A quiet morning hum' }));

    rerender(<LyricLineButton {...makeProps({ isActive: false, activeRef })} />);

    expect(activeRef.current).toBeNull();
  });
});

describe('LyricLineButton karaoke animation', () => {
  afterEach(() => {
    useLyricsAppearanceStore.setState({ lyricsAnimation: LYRICS_ANIMATION_DEFAULT });
    usePlaybackStore.setState({ isPlaying: false, currentTime: 0, _seekTarget: null });
  });

  // 'A quiet morning hum' at 4s over 8s: 16 word chars, half a second each.
  function renderActive(currentTime: number, isPlaying = true) {
    usePlaybackStore.setState({ currentTime, isPlaying, _seekTarget: null });
    const { container } = render(
      <LyricLineButton {...makeProps({ isActive: true, duration: 8 })} />
    );
    return Array.from(container.querySelectorAll<HTMLSpanElement>('.lyric-word'));
  }

  it('splits the active line into word spans and keeps the accessible name', () => {
    const words = renderActive(4);

    expect(words.map(w => w.textContent)).toEqual(['A', 'quiet', 'morning', 'hum']);
    expect(words[0]).toHaveClass('lyric-word-fill');
    expect(screen.getByRole('button', { name: 'A quiet morning hum' })).toBeInTheDocument();
  });

  it('starts mid-line with negative delays for words already underway', () => {
    // 2s into the line: "A" (0s) and "quiet" (0.5s) are underway, "hum" (6.5s) waits.
    const words = renderActive(6);

    expect(words[0].style.animationDelay).toBe('-2s');
    expect(words[1].style.animationDelay).toBe('-1.5s');
    expect(words[3].style.animationDelay).toBe('4.5s');
    expect(words[1].style.animationDuration).toBe('2.5s');
  });

  it('pauses the animation while playback is paused', () => {
    const words = renderActive(4, false);
    expect(words[0].style.animationPlayState).toBe('paused');
  });

  it('restarts in sync when a seek lands inside the same line', () => {
    renderActive(4);
    act(() => {
      usePlaybackStore.getState().seek(10);
      // The audio engine clears the target in the same notification.
      usePlaybackStore.getState()._clearSeekTarget();
    });

    const first = document.querySelector<HTMLSpanElement>('.lyric-word');
    expect(first?.style.animationDelay).toBe('-6s');
  });

  it('uses the chosen style class per word', () => {
    useLyricsAppearanceStore.setState({ lyricsAnimation: 'glow' });
    const words = renderActive(4);
    expect(words[0]).toHaveClass('lyric-word-glow');
    // A one-letter word still glows for the minimum span.
    expect(words[0].style.animationDuration).toBe('0.6s');
  });

  it('renders plain text when the animation is off, or the line is not active', () => {
    useLyricsAppearanceStore.setState({ lyricsAnimation: 'off' });
    expect(renderActive(4)).toHaveLength(0);

    useLyricsAppearanceStore.setState({ lyricsAnimation: 'fill' });
    const { container } = render(<LyricLineButton {...makeProps({ duration: 8 })} />);
    expect(container.querySelector('.lyric-word')).toBeNull();
  });

  it('falls back to plain text under prefers-reduced-motion', () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    expect(renderActive(4)).toHaveLength(0);
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
  });
});
