import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import UiScalePreview from './UiScalePreview';

describe('UiScalePreview', () => {
  it('renders the scale preview with both sample tiles', () => {
    render(<UiScalePreview scale={120} />);

    expect(screen.getByRole('img', { name: 'Scale preview' })).toBeInTheDocument();
  });
});
