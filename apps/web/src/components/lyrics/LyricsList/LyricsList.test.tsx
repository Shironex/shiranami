import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsList from './LyricsList';

const CLASSES = {
  baseClassName: 'lyric-base',
  activeClassName: 'lyric-active',
  pastClassName: 'lyric-past',
  idleClassName: 'lyric-idle',
};

function makeLines(): LyricLine[] {
  return [
    { time: 0, text: 'First line' },
    { time: 5, text: 'Second line' },
    { time: 10, text: 'Third line' },
  ];
}

describe('LyricsList', () => {
  it('renders one button per lyric line', () => {
    render(<LyricsList lines={makeLines()} activeIndex={1} onLineClick={vi.fn()} {...CLASSES} />);

    expect(screen.getByRole('button', { name: 'First line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Second line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Third line' })).toBeInTheDocument();
  });

  it('marks past, active, and idle lines with their respective classes', () => {
    render(<LyricsList lines={makeLines()} activeIndex={1} onLineClick={vi.fn()} {...CLASSES} />);

    expect(screen.getByRole('button', { name: 'First line' })).toHaveClass('lyric-past');
    expect(screen.getByRole('button', { name: 'Second line' })).toHaveClass('lyric-active');
    expect(screen.getByRole('button', { name: 'Third line' })).toHaveClass('lyric-idle');
  });

  it('calls onLineClick with the line timestamp when a line is clicked', () => {
    const onLineClick = vi.fn();
    render(
      <LyricsList lines={makeLines()} activeIndex={0} onLineClick={onLineClick} {...CLASSES} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Third line' }));

    expect(onLineClick).toHaveBeenCalledWith(10);
  });

  it('renders the bottom spacer only when a spacer class is provided', () => {
    const { container, rerender } = render(
      <LyricsList lines={makeLines()} activeIndex={0} onLineClick={vi.fn()} {...CLASSES} />
    );
    expect(container.querySelector('.bottom-spacer')).toBeNull();

    rerender(
      <LyricsList
        lines={makeLines()}
        activeIndex={0}
        onLineClick={vi.fn()}
        bottomSpacerClassName="bottom-spacer"
        {...CLASSES}
      />
    );
    expect(container.querySelector('.bottom-spacer')).not.toBeNull();
  });
});
