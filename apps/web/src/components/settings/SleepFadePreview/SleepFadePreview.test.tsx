import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SleepFadePreview from './SleepFadePreview';

const BAR = '.bg-primary\\/45';

function barHeights(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(BAR)).map(bar =>
    bar instanceof HTMLElement ? bar.style.height : ''
  );
}

describe('SleepFadePreview', () => {
  it('renders the fixed fourteen-bar volume ramp', () => {
    const { container } = render(<SleepFadePreview duration={15} />);

    expect(screen.getByText('Fade preview')).toBeInTheDocument();
    expect(container.querySelectorAll(BAR)).toHaveLength(14);
  });

  it('claims half the bars for a mid-range fade', () => {
    const { container } = render(<SleepFadePreview duration={15} />);

    const heights = barHeights(container);
    // 15s of the 30s maximum → 7 of the 14 bars ramp down.
    expect(heights.filter(h => h === '100%')).toHaveLength(7);
  });

  it('keeps the ramp short for the shortest fade', () => {
    const { container } = render(<SleepFadePreview duration={2} />);

    const heights = barHeights(container);
    expect(heights.filter(h => h === '100%')).toHaveLength(12);
  });

  it('ramps across every bar at the longest fade', () => {
    const { container } = render(<SleepFadePreview duration={30} />);

    const heights = barHeights(container);
    expect(heights.filter(h => h === '100%')).toHaveLength(0);
  });

  it('always ends on the quietest bar', () => {
    const { container } = render(<SleepFadePreview duration={20} />);

    const levels = barHeights(container).map(h => Number.parseFloat(h));
    expect(levels[levels.length - 1]).toBeLessThan(levels[0]);
    expect(Math.min(...levels)).toBe(levels[levels.length - 1]);
  });

  it('names the fade length in the caption', () => {
    render(<SleepFadePreview duration={12} />);

    expect(
      screen.getByText('Volume eases out over 12s when the sleep timer ends')
    ).toBeInTheDocument();
  });
});
