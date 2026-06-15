import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CompactModePreview from './CompactModePreview';

describe('CompactModePreview', () => {
  it('renders the compact mode preview mock', () => {
    render(<CompactModePreview />);

    expect(screen.getByRole('img', { name: 'Preview' })).toBeInTheDocument();
  });
});
