import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AudioVisualizer from './AudioVisualizer';

describe('AudioVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<AudioVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
