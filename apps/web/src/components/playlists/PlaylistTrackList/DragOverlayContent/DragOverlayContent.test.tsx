import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';

import DragOverlayContent from './DragOverlayContent';

// A 1×1 transparent PNG so the artwork branch renders a real <img> without a
// network fetch.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Girl',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

/** The right-aligned duration cell, which is empty for an unprobed track. */
function durationCellOf(container: HTMLElement): Element | null {
  return container.querySelector('.tabular-nums');
}

describe('DragOverlayContent', () => {
  it('renders the dragged track title and artist', () => {
    render(<DragOverlayContent track={makeTrack()} />);

    expect(screen.getByText('Midnight study session')).toBeInTheDocument();
    expect(screen.getByText('Lofi Girl')).toBeInTheDocument();
  });

  it('renders the cover art with the track title as its alt text', () => {
    render(<DragOverlayContent track={makeTrack({ albumArt: PIXEL_PNG })} />);

    const cover = screen.getByRole('img', { name: 'Midnight study session' });
    expect(cover).toHaveAttribute('src', PIXEL_PNG);
  });

  it('falls back to the decorative play glyph when the track has no cover', () => {
    render(<DragOverlayContent track={makeTrack({ albumArt: undefined })} />);

    // The fallback is a bare icon, so no image reaches the accessibility tree.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('formats the duration as m:ss', () => {
    const { container } = render(<DragOverlayContent track={makeTrack({ duration: 215 })} />);

    expect(durationCellOf(container)?.textContent).toBe('3:35');
  });

  it('leaves the duration cell blank for a track with no known duration', () => {
    const { container } = render(<DragOverlayContent track={makeTrack({ duration: 0 })} />);

    const cell = durationCellOf(container);
    expect(cell).not.toBeNull();
    expect(cell?.textContent).toBe('');
  });

  it('renders no interactive controls — the overlay is an inert drag preview', () => {
    render(<DragOverlayContent track={makeTrack()} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
