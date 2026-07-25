import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LibraryBannerPreview from './LibraryBannerPreview';

/** The hero banner is the only block sitting above the tile grid. */
const BANNER = '.bg-primary\\/10';
const TILE_GRID = '.grid';

describe('LibraryBannerPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<LibraryBannerPreview enabled />);

    expect(screen.getByRole('img', { name: 'Banner preview' })).toBeInTheDocument();
  });

  it('gives the banner its full height when the hero card is enabled', () => {
    const { container } = render(<LibraryBannerPreview enabled />);

    const banner = container.querySelector(BANNER);
    expect(banner).toHaveClass('h-16', 'opacity-100');
    expect(banner).not.toHaveClass('h-0');
  });

  it('collapses the banner without unmounting it when disabled', () => {
    const { container } = render(<LibraryBannerPreview enabled={false} />);

    const banner = container.querySelector(BANNER);
    // The banner stays mounted so the height transition can animate.
    expect(banner).not.toBeNull();
    expect(banner).toHaveClass('h-0', 'p-0', 'opacity-0', 'border-transparent');
  });

  it('keeps the library tile grid unchanged either way', () => {
    const { container: on } = render(<LibraryBannerPreview enabled />);
    const { container: off } = render(<LibraryBannerPreview enabled={false} />);

    expect(on.querySelector(TILE_GRID)?.children).toHaveLength(3);
    expect(off.querySelector(TILE_GRID)?.children).toHaveLength(3);
  });
});
