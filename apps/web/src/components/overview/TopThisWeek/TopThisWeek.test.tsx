import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ListeningStatsTrack } from '@/types/electron';

import TopThisWeek from './TopThisWeek';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 2400,
    lastPlayedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('TopThisWeek', () => {
  it('shows the empty copy when there are no tracks', () => {
    render(<TopThisWeek tracks={[]} onPlay={vi.fn()} onOpenLibrary={vi.fn()} />);

    expect(screen.getByText(/your week will start to take shape/)).toBeInTheDocument();
  });

  it('plays a track when its row is clicked', async () => {
    const onPlay = vi.fn();
    render(
      <TopThisWeek
        tracks={[makeTrack({ trackId: 't1', title: 'Drift' })]}
        onPlay={onPlay}
        onOpenLibrary={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Play Drift' }));
    expect(onPlay).toHaveBeenCalledWith('t1');
  });

  it('invokes the open-library handler from the header action', async () => {
    const onOpenLibrary = vi.fn();
    render(<TopThisWeek tracks={[makeTrack()]} onPlay={vi.fn()} onOpenLibrary={onOpenLibrary} />);

    await userEvent.click(screen.getByRole('button', { name: /Open library/ }));
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
  });
});
