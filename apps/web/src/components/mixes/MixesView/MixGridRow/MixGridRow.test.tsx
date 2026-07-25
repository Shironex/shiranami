import { fireEvent, render, screen } from '@testing-library/react';
import { TrendingUp } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import type { IMixGridCard } from '../MixesView.types';

import MixGridRow from './MixGridRow';

const ART = 'https://example.com/cover.jpg';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    albumArt: ART,
    ...overrides,
  };
}

function makePreviews(count: number): Track[] {
  return Array.from({ length: count }).map((_, i) => makeTrack({ id: `track-${i}` }));
}

function makeCard(overrides: Partial<IMixGridCard> = {}): IMixGridCard {
  return {
    id: 'most-played',
    icon: TrendingUp,
    title: 'Most Played',
    desc: 'The tracks you keep coming back to',
    count: 12,
    previewTracks: makePreviews(4),
    onOpen: vi.fn(),
    ...overrides,
  };
}

describe('MixGridRow', () => {
  it('names the row button with its title, description and track count', () => {
    render(<MixGridRow card={makeCard()} countLabel="12 tracks" />);

    expect(
      screen.getByRole('button', {
        name: 'Most Played The tracks you keep coming back to 12 tracks',
      })
    ).toBeInTheDocument();
  });

  it('opens the mix when the row is clicked', () => {
    const onOpen = vi.fn();
    render(<MixGridRow card={makeCard({ onOpen })} countLabel="12 tracks" />);

    fireEvent.click(screen.getByRole('button', { name: /Most Played/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders a four-tile mosaic once four preview tracks carry artwork', () => {
    const { container } = render(
      <MixGridRow card={makeCard({ previewTracks: makePreviews(6) })} countLabel="12 tracks" />
    );

    expect(container.querySelectorAll('img')).toHaveLength(4);
    expect(container.querySelector('.grid-cols-2')).not.toBeNull();
  });

  it('renders a single cover below the mosaic threshold', () => {
    const { container } = render(
      <MixGridRow card={makeCard({ previewTracks: makePreviews(3) })} countLabel="3 tracks" />
    );

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', ART);
    expect(container.querySelector('.grid-cols-2')).toBeNull();
  });

  it('falls back to the mix icon when no preview track has artwork', () => {
    const { container } = render(
      <MixGridRow card={makeCard({ previewTracks: [] })} countLabel="0 tracks" />
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('svg.lucide-trending-up')).not.toBeNull();
  });

  it('keeps every preview image out of the accessibility tree', () => {
    const { container } = render(<MixGridRow card={makeCard()} countLabel="12 tracks" />);

    for (const img of container.querySelectorAll('img')) {
      expect(img).toHaveAttribute('aria-hidden', 'true');
      expect(img).toHaveAttribute('alt', '');
    }
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('hides the trailing count for an empty mix', () => {
    render(<MixGridRow card={makeCard({ count: 0 })} countLabel="0 tracks" />);

    expect(screen.queryByText('0 tracks')).toBeNull();
    expect(screen.getByText('Most Played')).toBeInTheDocument();
  });
});
