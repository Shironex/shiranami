import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EqBars from './EqBars';

describe('EqBars', () => {
  it('renders three decorative equalizer bars', () => {
    const { container } = render(<EqBars />);

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root).toBeInTheDocument();
    expect(root?.querySelectorAll('div')).toHaveLength(3);
  });

  it('applies the small variant sizing', () => {
    const { container } = render(<EqBars size="sm" />);

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root?.className).toContain('h-3');
  });

  it('merges a custom className onto the root', () => {
    const { container } = render(<EqBars className="custom-class" />);

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root?.className).toContain('custom-class');
  });
});
