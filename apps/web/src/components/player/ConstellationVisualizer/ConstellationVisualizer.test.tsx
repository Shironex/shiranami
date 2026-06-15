import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ConstellationVisualizer from './ConstellationVisualizer';

describe('ConstellationVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<ConstellationVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
