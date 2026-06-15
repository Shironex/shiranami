import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AccentPreview from './AccentPreview';

describe('AccentPreview', () => {
  it('renders the accent preview sample chrome', () => {
    render(<AccentPreview />);

    expect(screen.getByRole('img', { name: 'Accent preview' })).toBeInTheDocument();
  });
});
