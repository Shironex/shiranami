import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EnrichBeforeAfterPreview from './EnrichBeforeAfterPreview';

describe('EnrichBeforeAfterPreview', () => {
  it('renders the before/after labels and the enriched sample tags', () => {
    render(<EnrichBeforeAfterPreview />);

    expect(screen.getByText('From filename')).toBeInTheDocument();
    expect(screen.getByText('Enriched')).toBeInTheDocument();
    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
    expect(screen.getByText('Nujabes')).toBeInTheDocument();
    expect(screen.getByText('Modal Soul')).toBeInTheDocument();
  });

  it('renders the high-confidence badge for the enriched sample', () => {
    render(<EnrichBeforeAfterPreview />);

    expect(screen.getByText('Strong match')).toBeInTheDocument();
  });
});
