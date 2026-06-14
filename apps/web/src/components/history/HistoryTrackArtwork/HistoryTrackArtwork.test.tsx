import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HistoryTrackArtwork from './HistoryTrackArtwork';

describe('HistoryTrackArtwork', () => {
  it('renders the fallback icon when no album art is provided', () => {
    const { container } = render(<HistoryTrackArtwork albumArt={null} title="Lofi beats" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the album art with the track title as alt text', () => {
    render(<HistoryTrackArtwork albumArt="https://example.com/cover.jpg" title="Lofi beats" />);

    const img = screen.getByRole('img', { name: 'Lofi beats' });
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });
});
