import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashSteam from './SplashSteam';

function renderWisps(reducedMotion: boolean): SVGPathElement[] {
  const { container } = render(<SplashSteam reducedMotion={reducedMotion} />);
  return Array.from(container.querySelectorAll<SVGPathElement>('path.splash-steam'));
}

describe('SplashSteam', () => {
  it('renders three wisps layered back to front by opacity', () => {
    const wisps = renderWisps(false);

    expect(wisps).toHaveLength(3);
    // The centre wisp is fully opaque; the flanking two recede.
    expect(wisps[0].getAttribute('opacity')).toBeNull();
    expect(wisps[1].getAttribute('opacity')).toBe('0.65');
    expect(wisps[2].getAttribute('opacity')).toBe('0.45');
  });

  it('staggers the rise so the wisps never move in lockstep', () => {
    const animations = renderWisps(false).map(wisp => wisp.style.animation);

    expect(animations).toEqual([
      'steam-rise 3.6s ease-in-out infinite',
      'steam-rise 3.6s 0.8s ease-in-out infinite',
      'steam-rise 3.6s 1.6s ease-in-out infinite',
    ]);
  });

  it('strokes the vapor from --foreground rather than the violet accent', () => {
    const wisps = renderWisps(false);

    for (const wisp of wisps) {
      expect(wisp.getAttribute('stroke')).toBe('oklch(from var(--foreground) l c h / 0.3)');
      expect(wisp.getAttribute('stroke-dasharray')).toBe('140');
    }
  });

  it('drops every inline loop under reduced motion but keeps the degrade hook', () => {
    const wisps = renderWisps(true);

    expect(wisps).toHaveLength(3);
    expect(wisps.map(wisp => wisp.style.animation)).toEqual(['', '', '']);
    // The class stays so the stylesheet guard can hide the steam outright.
    for (const wisp of wisps) {
      expect(wisp).toHaveClass('splash-steam');
    }
  });

  it('keeps the steam column decorative and out of the pointer path', () => {
    const { container } = render(<SplashSteam reducedMotion={false} />);

    const column = container.firstElementChild;
    expect(column).toHaveAttribute('aria-hidden', 'true');
    expect(column).toHaveClass('pointer-events-none');
  });
});
