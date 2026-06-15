import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import VinylVisualizer from './VinylVisualizer';

describe('VinylVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<VinylVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
