import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OverviewViewSkeleton from './OverviewViewSkeleton';

/** The root frame carries both `aria-busy` and `aria-hidden`. */
function frameOf(container: HTMLElement): Element | null {
  return container.querySelector('[aria-busy="true"]');
}

describe('OverviewViewSkeleton', () => {
  it('marks the whole frame busy while the overview data loads', () => {
    const { container } = render(<OverviewViewSkeleton />);

    expect(frameOf(container)).not.toBeNull();
  });

  it('hides the placeholder frame from assistive tech', () => {
    const { container } = render(<OverviewViewSkeleton />);

    expect(frameOf(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('mirrors the loaded layout: hero, stat strip, two-column row, and shelf', () => {
    const { container } = render(<OverviewViewSkeleton />);

    expect(frameOf(container)?.children).toHaveLength(4);
  });

  it('fills the stat strip with four tile placeholders', () => {
    const { container } = render(<OverviewViewSkeleton />);

    const [statGrid] = container.querySelectorAll('.grid');
    expect(statGrid.children).toHaveLength(4);
  });

  it('splits the two-column row into the wide panel and the stacked side column', () => {
    const { container } = render(<OverviewViewSkeleton />);

    const [, twoColumnRow] = container.querySelectorAll('.grid');
    expect(twoColumnRow.children).toHaveLength(2);
    // The side column stacks the listening clock + top albums placeholders.
    expect(twoColumnRow.children[1].children).toHaveLength(2);
  });

  it('gives the recommendations shelf four library rows and four discover rows', () => {
    const { container } = render(<OverviewViewSkeleton />);

    const [, , libraryGrid, discoverGrid] = container.querySelectorAll('.grid');
    expect(libraryGrid.children).toHaveLength(4);
    expect(discoverGrid.children).toHaveLength(4);
  });

  it('shimmers every placeholder block', () => {
    const { container } = render(<OverviewViewSkeleton />);

    // 1 hero + 4 stat tiles + 3 two-column panels + 3 shelf-header bars
    // + 2 section labels + 8 recommendation rows.
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(21);
  });

  it('renders no readable copy or interactive controls while loading', () => {
    const { container } = render(<OverviewViewSkeleton />);

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button', { hidden: true })).toBeNull();
  });
});
