import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';

import RecentlyAdded from './RecentlyAdded';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/drift.mp3',
    createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    ...overrides,
  };
}

describe('RecentlyAdded', () => {
  it('renders a count label and a card per track', () => {
    render(
      <RecentlyAdded
        tracks={[
          makeTrack({ id: 't1', title: 'Drift' }),
          makeTrack({ id: 't2', title: 'Afterglow' }),
        ]}
        onPlay={vi.fn()}
      />
    );

    expect(screen.getByText('2 new tracks')).toBeInTheDocument();
    expect(screen.getByText('Drift')).toBeInTheDocument();
    expect(screen.getByText('Afterglow')).toBeInTheDocument();
  });

  it('plays a track when its card is clicked', async () => {
    const onPlay = vi.fn();
    render(<RecentlyAdded tracks={[makeTrack({ id: 't1', title: 'Drift' })]} onPlay={onPlay} />);

    await userEvent.click(screen.getByRole('button', { name: 'Play Drift' }));
    expect(onPlay).toHaveBeenCalledWith('t1');
  });
});
