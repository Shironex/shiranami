import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MountainVisualizer from './MountainVisualizer';

describe('MountainVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<MountainVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
