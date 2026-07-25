import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FavoriteBurst from './FavoriteBurst';

describe('FavoriteBurst', () => {
  it('renders a ring that assistive tech ignores', () => {
    const { container } = render(<FavoriteBurst burstKey={1} />);

    const ring = container.querySelector('span');
    expect(ring).toBeInTheDocument();
    expect(ring).toHaveAttribute('aria-hidden', 'true');
  });

  it('fills its positioned parent without swallowing pointer events', () => {
    const { container } = render(<FavoriteBurst burstKey={1} />);

    const ring = container.querySelector('span');
    expect(ring?.className).toContain('absolute');
    expect(ring?.className).toContain('inset-0');
    expect(ring?.className).toContain('rounded-full');
    expect(ring?.className).toContain('pointer-events-none');
  });

  it('remounts the ring when the burst key changes so the animation replays', () => {
    const { container, rerender } = render(<FavoriteBurst burstKey={1} />);
    const firstRing = container.querySelector('span');

    rerender(<FavoriteBurst burstKey={2} />);

    expect(container.querySelector('span')).not.toBe(firstRing);
  });

  it('keeps the same ring node while the burst key holds steady', () => {
    const { container, rerender } = render(<FavoriteBurst burstKey={3} />);
    const firstRing = container.querySelector('span');

    rerender(<FavoriteBurst burstKey={3} />);

    expect(container.querySelector('span')).toBe(firstRing);
  });
});
