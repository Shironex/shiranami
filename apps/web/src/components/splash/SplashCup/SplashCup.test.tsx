import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashCup from './SplashCup';

describe('SplashCup', () => {
  it('anchors the cup to the bottom-right corner as decoration', () => {
    const { container } = render(<SplashCup />);

    const cup = container.firstElementChild;
    if (!(cup instanceof HTMLElement)) throw new Error('cup wrapper missing');
    expect(cup).toHaveAttribute('aria-hidden', 'true');
    expect(cup).toHaveClass('absolute', 'pointer-events-none');
    expect(cup.style.right).toBe('38px');
    expect(cup.style.bottom).toBe('30px');
  });

  it('carries the perf-gated drop shadow on a class the low-perf guard targets', () => {
    const { container } = render(<SplashCup />);

    const cup = container.firstElementChild;
    if (!(cup instanceof HTMLElement)) throw new Error('cup wrapper missing');
    // `.splash-cup-shadow` is what `[data-perf-mode='low']` hooks to drop the
    // (compositor-expensive) filter.
    expect(cup).toHaveClass('splash-cup-shadow');
    expect(cup.style.filter).toContain('drop-shadow');
  });

  it('paints the ceramic from theme tokens and the coffee from its own gradient', () => {
    const { container } = render(<SplashCup />);

    const body = container.querySelector('#splash-cup-body');
    const coffee = container.querySelector('#splash-cup-coffee');
    expect(body).not.toBeNull();
    expect(coffee).not.toBeNull();
    // Ceramic follows --background; the warm brown stays confined to the SVG.
    expect(body?.innerHTML).toContain('var(--background)');
    expect(coffee?.innerHTML).not.toContain('var(');
  });

  it('renders the full mug, saucer, and crema assembly', () => {
    const { container } = render(<SplashCup />);

    // saucer x2, coffee surface + its rim, two crema highlights.
    expect(container.querySelectorAll('ellipse')).toHaveLength(6);
    // handle, mug body, mug highlight.
    expect(container.querySelectorAll('path')).toHaveLength(3);
  });
});
