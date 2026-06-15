import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EnrichConfidenceBadge from './EnrichConfidenceBadge';

describe('EnrichConfidenceBadge', () => {
  it('renders the high-confidence label for a strong match', () => {
    render(<EnrichConfidenceBadge confidence={0.92} />);

    expect(screen.getByText('Strong match')).toBeInTheDocument();
  });

  it('renders the medium-confidence label for a likely match', () => {
    render(<EnrichConfidenceBadge confidence={0.6} />);

    expect(screen.getByText('Likely match')).toBeInTheDocument();
  });

  it('renders nothing when the confidence score is missing', () => {
    const { container } = render(<EnrichConfidenceBadge confidence={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
