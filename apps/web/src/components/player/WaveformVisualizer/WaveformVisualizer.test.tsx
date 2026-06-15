import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WaveformVisualizer from './WaveformVisualizer';

describe('WaveformVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<WaveformVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
