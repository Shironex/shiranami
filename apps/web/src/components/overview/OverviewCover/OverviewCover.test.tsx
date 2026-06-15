import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OverviewCover from './OverviewCover';

describe('OverviewCover', () => {
  it('renders a deterministic fallback glyph when there is no album art', () => {
    const { container } = render(<OverviewCover title="Midnight Tapes" seed="Idealism" />);

    // The fallback gradient layer is decorative and aria-hidden.
    const fallback = container.querySelector('[aria-hidden="true"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent?.length).toBeGreaterThan(0);
  });

  it('prefers a CJK character from the seed for the glyph', () => {
    const { container } = render(<OverviewCover title="夜のしらべ" seed="夜のしらべ" />);

    const glyph = container.querySelector('[aria-hidden="true"] span');
    expect(glyph?.textContent).toBe('夜');
  });

  it('renders the real album art when provided', () => {
    render(<OverviewCover title="Midnight Tapes" seed="Idealism" albumArt="cover.png" />);

    expect(screen.getByRole('img', { name: 'Midnight Tapes' })).toBeInTheDocument();
  });
});
