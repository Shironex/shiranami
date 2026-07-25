import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StationRowSkeleton, { RADIO_SKELETON_ROWS } from './StationRowSkeleton';

describe('StationRowSkeleton', () => {
  it('renders the six placeholder bars that stand in for a station row', () => {
    const { container } = render(<StationRowSkeleton />);

    // Favicon, name, tags, country flag, codec badge, play affordance.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });

  it('pulses every placeholder so the row reads as loading', () => {
    const { container } = render(<StationRowSkeleton />);

    const placeholders = container.querySelectorAll('[data-slot="skeleton"]');
    for (const placeholder of placeholders) {
      expect(placeholder.className).toContain('animate-pulse');
    }
  });

  it('matches the 52px height of a real station row so the list does not jump', () => {
    const { container } = render(<StationRowSkeleton />);

    expect(container.querySelector('.h-\\[52px\\]')).not.toBeNull();
  });

  it('hides the country/codec meta group below the sm breakpoint, like the real row', () => {
    const { container } = render(<StationRowSkeleton />);

    const metaGroup = container.querySelector('.sm\\:flex');
    expect(metaGroup).not.toBeNull();
    expect(metaGroup?.className).toContain('hidden');
  });

  it('exposes no text or roles while loading', () => {
    const { container } = render(<StationRowSkeleton />);

    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });

  it('publishes the placeholder row count RadioView renders while loading', () => {
    expect(RADIO_SKELETON_ROWS).toBe(10);
  });
});
