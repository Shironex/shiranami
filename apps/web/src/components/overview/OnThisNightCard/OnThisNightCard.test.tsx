import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnThisNightMemory } from '@/hooks/queries/useMemories';

import OnThisNightCard from './OnThisNightCard';

function makeMemory(overrides: Partial<OnThisNightMemory> = {}): OnThisNightMemory {
  return {
    distance: 'year',
    anchorIso: '2025-08-14T12:00:00.000Z',
    track: {
      trackId: 'trk-1',
      title: 'Kiro',
      artist: 'Shironami',
      album: 'Night Drift',
      albumArt: null,
      playCount: 4,
      listenedSeconds: 900,
      lastPlayedAt: '2025-08-14T23:00:00.000Z',
    },
    totalPlays: 6,
    ...overrides,
  };
}

describe('OnThisNightCard', () => {
  it('narrates a year-old night: heading, date eyebrow, prose line, track row', () => {
    render(<OnThisNightCard memory={makeMemory()} onPlay={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /A year ago, tonight\./ })).toBeInTheDocument();
    expect(screen.getByText(/August/)).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.getByText('This one kept the night company — 4 plays.')).toBeInTheDocument();
    expect(screen.getByText('Kiro')).toBeInTheDocument();
    expect(screen.getByText('Shironami · Night Drift')).toBeInTheDocument();
  });

  it('speaks in the six-month voice for the fallback window', () => {
    render(<OnThisNightCard memory={makeMemory({ distance: 'halfYear' })} onPlay={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Six months ago, tonight\./ })).toBeInTheDocument();
  });

  it('softens the line when the night held a single play', () => {
    const memory = makeMemory();
    memory.track.playCount = 1;
    render(<OnThisNightCard memory={memory} onPlay={vi.fn()} />);

    expect(screen.getByText('This one drifted through that evening.')).toBeInTheDocument();
    expect(screen.queryByText(/kept the night company/)).not.toBeInTheDocument();
  });

  it('drops the album from the subtitle when the track has none', () => {
    const memory = makeMemory();
    memory.track.album = '';
    render(<OnThisNightCard memory={memory} onPlay={vi.fn()} />);

    expect(screen.getByText('Shironami')).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('plays the remembered track from the labelled row', async () => {
    const onPlay = vi.fn();
    render(<OnThisNightCard memory={makeMemory()} onPlay={onPlay} />);

    await userEvent.click(screen.getByRole('button', { name: 'Play Kiro by Shironami' }));
    expect(onPlay).toHaveBeenCalledWith('trk-1');
  });
});
