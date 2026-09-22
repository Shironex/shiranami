import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WeeklyRecap } from '@/hooks/queries/useRecap';

import WeeklyRecapCard from './WeeklyRecapCard';

function makeRecap(overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    weekKey: '2026-07-27',
    totalPlays: 42,
    totalMinutes: 400,
    sessionCount: 11,
    topTrack: { title: 'Kiro', playCount: 9 },
    loudestHour: 23,
    ...overrides,
  };
}

describe('WeeklyRecapCard', () => {
  it('narrates the week as prose: hours across sittings, the track, the loudest hour', () => {
    render(<WeeklyRecapCard recap={makeRecap()} />);

    expect(screen.getByRole('heading', { name: /The week, in short\./ })).toBeInTheDocument();
    expect(
      screen.getByText(/6 hours and 40 minutes of music across 11 sittings\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/You kept coming back to Kiro — 9 times\./)).toBeInTheDocument();
    expect(screen.getByText('Loudest at 23:00.')).toBeInTheDocument();
  });

  it('drops the track line when nothing was returned to (single play is not a habit)', () => {
    render(<WeeklyRecapCard recap={makeRecap({ topTrack: { title: 'Kiro', playCount: 1 } })} />);

    expect(screen.queryByText(/coming back/)).not.toBeInTheDocument();
  });

  it('drops the loudest line when the week had no clear peak', () => {
    render(<WeeklyRecapCard recap={makeRecap({ loudestHour: null })} />);

    expect(screen.queryByText(/Loudest at/)).not.toBeInTheDocument();
  });

  it('offers the archive action only when a handler is wired', async () => {
    const onOpenArchive = vi.fn();
    const { rerender } = render(<WeeklyRecapCard recap={makeRecap()} />);
    expect(screen.queryByRole('button', { name: /Past weeks/ })).not.toBeInTheDocument();

    rerender(<WeeklyRecapCard recap={makeRecap()} onOpenArchive={onOpenArchive} />);
    await userEvent.click(screen.getByRole('button', { name: /Past weeks/ }));
    expect(onOpenArchive).toHaveBeenCalledTimes(1);
  });

  it('shows the week-range eyebrow in the archive context', () => {
    render(<WeeklyRecapCard recap={makeRecap()} weekLabel="27 Jul – 2 Aug" />);

    expect(screen.getByText('27 Jul – 2 Aug')).toBeInTheDocument();
  });
});
