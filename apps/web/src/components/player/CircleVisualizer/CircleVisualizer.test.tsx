import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CircleVisualizer from './CircleVisualizer';

describe('CircleVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<CircleVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
