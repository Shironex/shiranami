import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
