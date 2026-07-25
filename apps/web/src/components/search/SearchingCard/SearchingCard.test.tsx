import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/lib/i18n';

import SearchingCard from './SearchingCard';

describe('SearchingCard', () => {
  it('renders the localized searching heading', () => {
    render(<SearchingCard query="lofi beats" />);

    expect(screen.getByText('Searching YouTube')).toBeInTheDocument();
  });

  it('echoes the query in the subtitle', () => {
    render(<SearchingCard query="lofi beats" />);

    expect(screen.getByText('Pulling the best matches for "lofi beats"')).toBeInTheDocument();
  });

  it('trims surrounding whitespace out of the echoed query', () => {
    render(<SearchingCard query="   rainy jazz   " />);

    expect(screen.getByText('Pulling the best matches for "rainy jazz"')).toBeInTheDocument();
  });

  it('keeps the mascot decorative so the card exposes no image to assistive tech', () => {
    const { container } = render(<SearchingCard query="lofi" />);

    const mascot = container.querySelector('img');
    expect(mascot).toHaveAttribute('alt', '');
    expect(mascot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the spinning badge that marks the search as in flight', () => {
    const { container } = render(<SearchingCard query="lofi" />);

    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });
});
