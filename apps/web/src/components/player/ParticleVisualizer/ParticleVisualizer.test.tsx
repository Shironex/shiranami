import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ParticleVisualizer from './ParticleVisualizer';

describe('ParticleVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<ParticleVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
