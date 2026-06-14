import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import HistoryHeroSection from './HistoryHeroSection';

describe('HistoryHeroSection', () => {
  it('renders the hero copy and a pill per range', () => {
    render(<HistoryHeroSection selectedRange="all" onRangeChange={vi.fn()} />);

    expect(
      screen.getByText('A running picture of what you actually stick with.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 Days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 Days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Time' })).toBeInTheDocument();
  });

  it('calls onRangeChange with the clicked range id', () => {
    const onRangeChange = vi.fn();
    render(<HistoryHeroSection selectedRange="all" onRangeChange={onRangeChange} />);

    fireEvent.click(screen.getByRole('button', { name: '7 Days' }));

    expect(onRangeChange).toHaveBeenCalledWith('7d');
  });
});
