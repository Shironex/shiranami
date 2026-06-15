import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import KanjiVisualizer from './KanjiVisualizer';

describe('KanjiVisualizer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<KanjiVisualizer active />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
