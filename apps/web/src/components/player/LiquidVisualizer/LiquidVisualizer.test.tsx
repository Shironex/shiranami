import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LiquidVisualizer from './LiquidVisualizer';

describe('LiquidVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<LiquidVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
