import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LoudnessPreview from './LoudnessPreview';

/** The five illustrative track bars. */
const BAR = '.bg-primary\\/45';
/** The dashed target-loudness line. */
const TARGET_LINE = '.border-dashed';

function barHeights(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(BAR)).map(bar =>
    bar instanceof HTMLElement ? bar.style.height : ''
  );
}

describe('LoudnessPreview', () => {
  it('renders one bar per illustrative track', () => {
    const { container } = render(<LoudnessPreview enabled={false} target={-14} />);

    expect(screen.getByText('Leveling preview')).toBeInTheDocument();
    expect(container.querySelectorAll(BAR)).toHaveLength(5);
  });

  it('leaves the tracks at their own varying levels when leveling is off', () => {
    const { container } = render(<LoudnessPreview enabled={false} target={-14} />);

    const heights = barHeights(container);
    expect(new Set(heights).size).toBe(5);
    // 0.52 of the 3.5rem column.
    expect(heights[2]).toBe('1.82rem');
    expect(
      screen.getByText('Tracks play at their original, varying loudness.')
    ).toBeInTheDocument();
  });

  it('converges every track onto the target line when leveling is on', () => {
    const { container } = render(<LoudnessPreview enabled target={-14} />);

    // -14 LUFS is 9/14 of the -23..-9 range, i.e. 2.25rem of the 3.5rem column.
    expect(barHeights(container)).toEqual(Array(5).fill('2.25rem'));
    expect(
      screen.getByText('Tracks are nudged to a consistent target loudness.')
    ).toBeInTheDocument();
  });

  it('labels the target line with the current LUFS value', () => {
    render(<LoudnessPreview enabled target={-18} />);

    expect(screen.getByText('-18 LUFS')).toBeInTheDocument();
  });

  it('raises the target line as the target gets louder', () => {
    const { container: quiet } = render(<LoudnessPreview enabled target={-23} />);
    const { container: mid } = render(<LoudnessPreview enabled target={-14} />);
    const { container: loud } = render(<LoudnessPreview enabled target={-9} />);

    // The line is offset from the column baseline by the target's share of the
    // 3.5rem column: nothing at the quietest target, all of it at the loudest.
    expect(quiet.querySelector(TARGET_LINE)).toHaveStyle({ bottom: 'calc(0.75rem + 0rem)' });
    expect(mid.querySelector(TARGET_LINE)).toHaveStyle({ bottom: 'calc(0.75rem + 2.25rem)' });
    expect(loud.querySelector(TARGET_LINE)).toHaveStyle({ bottom: 'calc(0.75rem + 3.5rem)' });
  });
});
