import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RingsVisualizer from './RingsVisualizer';

describe('RingsVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<RingsVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
