import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import VuVisualizer from './VuVisualizer';

describe('VuVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<VuVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
