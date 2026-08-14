import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HistoryViewSkeleton from './HistoryViewSkeleton';

const HERO_PILLS = 3;
const STAT_CARDS = 4;
const PANELS = 4;
const LIST_ROWS = 14;
const TOTAL_PLACEHOLDERS = 67;

describe('HistoryViewSkeleton', () => {
  it('marks its root aria-busy so assistive tech knows the dashboard is still loading', () => {
    const { container } = render(<HistoryViewSkeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('reserves the hero block with its three range pills', () => {
    const { container } = render(<HistoryViewSkeleton />);

    expect(container.querySelectorAll('.rounded-\\[28px\\]')).toHaveLength(1);
    expect(container.querySelectorAll('.rounded-full')).toHaveLength(HERO_PILLS);
  });

  it('reserves the four summary stat cards on the same grid the loaded view uses', () => {
    const { container } = render(<HistoryViewSkeleton />);

    const statGrid = container.querySelector('.md\\:grid-cols-4');
    expect(statGrid?.children).toHaveLength(STAT_CARDS);
  });

  it('reserves the activity, top-tracks, top-artists and recent panels', () => {
    const { container } = render(<HistoryViewSkeleton />);

    expect(container.querySelectorAll('.rounded-panel')).toHaveLength(PANELS);
  });

  it('reserves four rows in each list panel plus six recent-play rows', () => {
    const { container } = render(<HistoryViewSkeleton />);

    expect(container.querySelectorAll('.border-border\\/20')).toHaveLength(LIST_ROWS);
  });

  it('renders the full placeholder set so the dashboard does not reflow on load', () => {
    const { container } = render(<HistoryViewSkeleton />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(TOTAL_PLACEHOLDERS);
  });

  it('pulses every placeholder so the dashboard reads as loading', () => {
    const { container } = render(<HistoryViewSkeleton />);

    for (const placeholder of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(placeholder.className).toContain('animate-pulse');
    }
  });

  it('renders no copy, so no heading flashes before the history lands', () => {
    const { container } = render(<HistoryViewSkeleton />);

    expect(container.textContent).toBe('');
  });
});
