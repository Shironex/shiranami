import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LibraryViewSkeleton from './LibraryViewSkeleton';

const PLACEHOLDER_ROWS = 14;
const BARS_PER_ROW = 4;
const SEARCH_BAR_BARS = 2;

describe('LibraryViewSkeleton', () => {
  it('marks its root aria-busy so assistive tech knows the library is still loading', () => {
    const { container } = render(<LibraryViewSkeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('renders one screenful of placeholder rows on the 52px track-row grid', () => {
    const { container } = render(<LibraryViewSkeleton />);

    expect(container.querySelectorAll('.h-\\[52px\\]')).toHaveLength(PLACEHOLDER_ROWS);
  });

  it('reserves the search bar and view toggle above the list so nothing reflows', () => {
    const { container } = render(<LibraryViewSkeleton />);

    const searchBar = container.querySelectorAll('.h-10');
    expect(searchBar).toHaveLength(SEARCH_BAR_BARS);
    expect(searchBar[0]).toHaveClass('flex-1');
    expect(searchBar[1]).toHaveClass('w-20');
  });

  it('renders artwork, title, artist and duration placeholders on every row', () => {
    const { container } = render(<LibraryViewSkeleton />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      SEARCH_BAR_BARS + PLACEHOLDER_ROWS * BARS_PER_ROW
    );
  });

  it('pulses every placeholder so the view reads as loading', () => {
    const { container } = render(<LibraryViewSkeleton />);

    for (const placeholder of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(placeholder.className).toContain('animate-pulse');
    }
  });

  it('renders no header or copy, so no text flashes before the tracks land', () => {
    const { container } = render(<LibraryViewSkeleton />);

    expect(container.textContent).toBe('');
  });
});
