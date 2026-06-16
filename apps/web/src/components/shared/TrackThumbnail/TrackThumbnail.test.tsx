import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrackThumbnail from './TrackThumbnail';

describe('TrackThumbnail', () => {
  it('renders the cover image when album art is provided', () => {
    render(
      <TrackThumbnail
        albumArt="https://example.com/cover.jpg"
        alt="Cover art"
        fallback={<span>fallback</span>}
      />
    );

    const img = screen.getByRole('img', { name: 'Cover art' });
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('renders the fallback when there is no album art', () => {
    render(<TrackThumbnail albumArt={null} alt="No cover" fallback={<span>fallback</span>} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('renders only the inner node without the wrapper box when fill is set', () => {
    const { container } = render(
      <TrackThumbnail albumArt={null} alt="Filled" fallback={<span>fallback</span>} fill />
    );

    // No wrapper div — the fragment renders the fallback span directly.
    expect(container.querySelector('div')).toBeNull();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });
});
