import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MixesViewSkeleton from './MixesViewSkeleton';

describe('MixesViewSkeleton', () => {
  it('marks the whole placeholder busy so assistive tech announces the wait', () => {
    const { container } = render(<MixesViewSkeleton />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('stands in for six mix rows plus the page title', () => {
    const { container } = render(<MixesViewSkeleton />);

    // One row wrapper per placeholder mix; the title bar is not a row.
    expect(container.querySelectorAll('.rounded-xl')).toHaveLength(6);
    // Title bar + per row: cover, title line, description line, count.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(25);
  });

  it('exposes no text, headings or controls while loading', () => {
    const { container } = render(<MixesViewSkeleton />);

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('animates every placeholder block', () => {
    const { container } = render(<MixesViewSkeleton />);

    const blocks = container.querySelectorAll('[data-slot="skeleton"]');
    for (const block of blocks) {
      expect(block).toHaveClass('animate-pulse');
    }
  });
});
