import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EqCurvePreview from './EqCurvePreview';

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe('EqCurvePreview', () => {
  it('renders the response-curve SVG with an accessible label', () => {
    render(<EqCurvePreview gains={FLAT} preampDb={0} />);

    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders one axis tick per EQ band', () => {
    const { container } = render(<EqCurvePreview gains={FLAT} preampDb={0} />);

    // Ten bands → ten frequency tick labels below the curve.
    const ticks = container.querySelectorAll('.tabular-nums > span');
    expect(ticks).toHaveLength(10);
  });

  it('dims the curve when disabled', () => {
    const { container } = render(<EqCurvePreview gains={FLAT} preampDb={0} disabled />);

    expect(container.firstChild).toHaveClass('opacity-50');
  });
});
