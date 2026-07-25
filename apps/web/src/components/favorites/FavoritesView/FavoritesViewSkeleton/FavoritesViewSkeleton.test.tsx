import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FavoritesViewSkeleton from './FavoritesViewSkeleton';

const PLACEHOLDER_ROWS = 10;
const BARS_PER_ROW = 4;

describe('FavoritesViewSkeleton', () => {
  it('marks its root aria-busy so assistive tech knows the list is still loading', () => {
    const { container } = render(<FavoritesViewSkeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('renders one screenful of placeholder rows', () => {
    const { container } = render(<FavoritesViewSkeleton />);

    expect(container.querySelectorAll('.h-\\[52px\\]')).toHaveLength(PLACEHOLDER_ROWS);
  });

  it('renders artwork, title, artist and duration placeholders on every row', () => {
    const { container } = render(<FavoritesViewSkeleton />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      PLACEHOLDER_ROWS * BARS_PER_ROW
    );
  });

  it('pulses every placeholder so the list reads as loading', () => {
    const { container } = render(<FavoritesViewSkeleton />);

    for (const placeholder of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(placeholder.className).toContain('animate-pulse');
    }
  });

  it('renders no header or copy, so no text flashes before the favorites land', () => {
    const { container } = render(<FavoritesViewSkeleton />);

    expect(container.textContent).toBe('');
  });
});
