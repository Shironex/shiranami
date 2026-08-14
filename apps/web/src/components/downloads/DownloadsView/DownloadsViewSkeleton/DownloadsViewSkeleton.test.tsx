import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DownloadsViewSkeleton from './DownloadsViewSkeleton';

const PLACEHOLDER_ROWS = 5;
const BARS_PER_ROW = 4;
const SECTION_HEADING_BARS = 2;

describe('DownloadsViewSkeleton', () => {
  it('marks its root aria-busy so assistive tech knows the queue is still loading', () => {
    const { container } = render(<DownloadsViewSkeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('renders two section groups of placeholder queue rows', () => {
    const { container } = render(<DownloadsViewSkeleton />);

    expect(container.querySelectorAll('.rounded-xl')).toHaveLength(PLACEHOLDER_ROWS);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      PLACEHOLDER_ROWS * BARS_PER_ROW + SECTION_HEADING_BARS
    );
  });

  it('pulses every placeholder so the queue reads as loading', () => {
    const { container } = render(<DownloadsViewSkeleton />);

    for (const placeholder of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(placeholder.className).toContain('animate-pulse');
    }
  });

  it('renders no copy, so no text flashes before the queue lands', () => {
    const { container } = render(<DownloadsViewSkeleton />);

    expect(container.textContent).toBe('');
  });
});
