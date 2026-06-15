import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MirrorVisualizer from './MirrorVisualizer';

describe('MirrorVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<MirrorVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
