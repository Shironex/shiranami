import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/lib/i18n';

import SearchErrorCard from './SearchErrorCard';

describe('SearchErrorCard', () => {
  it('renders the localized no-results heading', () => {
    render(<SearchErrorCard error="Network timeout" />);

    expect(screen.getByText('No results found. Try a different search term.')).toBeInTheDocument();
  });

  it('surfaces the failure message verbatim beneath the heading', () => {
    render(<SearchErrorCard error="yt-dlp exited with code 1" />);

    expect(screen.getByText('yt-dlp exited with code 1')).toBeInTheDocument();
  });

  it('tints the mascot frame with the destructive variant', () => {
    const { container } = render(<SearchErrorCard error="Network timeout" />);

    expect(container.querySelector('.bg-destructive\\/8')).not.toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the mascot decorative so the card exposes no image to assistive tech', () => {
    const { container } = render(<SearchErrorCard error="Network timeout" />);

    const mascot = container.querySelector('img');
    expect(mascot).toHaveAttribute('alt', '');
    expect(mascot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
