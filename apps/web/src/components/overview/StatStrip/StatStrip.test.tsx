import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ListeningStatsSummary } from '@/types/electron';

import StatStrip from './StatStrip';

function makeSummary(overrides: Partial<ListeningStatsSummary> = {}): ListeningStatsSummary {
  return {
    totalPlays: 128,
    totalMinutes: 872,
    uniqueTracks: 64,
    uniqueArtists: 22,
    completedPlays: 110,
    topTracks: [],
    topArtists: [{ artist: 'Idealism', playCount: 41, listenedSeconds: 9000 }],
    ...overrides,
  };
}

describe('StatStrip', () => {
  it('renders the four tile labels and the top artist', () => {
    render(<StatStrip summary={makeSummary()} newInLibraryCount={3} trendDeltaMinutes={138} />);

    expect(screen.getByText('Listened this week')).toBeInTheDocument();
    expect(screen.getByText('Tracks played')).toBeInTheDocument();
    expect(screen.getByText('Idealism')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('shows the week-over-week trend hint when a delta is supplied', () => {
    render(<StatStrip summary={makeSummary()} newInLibraryCount={0} trendDeltaMinutes={138} />);

    expect(screen.getByText('+2h 18m vs. last week')).toBeInTheDocument();
  });

  it('falls back to "No comparison yet" when no delta is supplied', () => {
    render(<StatStrip summary={makeSummary()} newInLibraryCount={0} />);

    expect(screen.getByText('No comparison yet')).toBeInTheDocument();
  });
});
