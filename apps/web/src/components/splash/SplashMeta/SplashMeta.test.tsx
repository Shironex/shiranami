import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashMeta from './SplashMeta';

describe('SplashMeta', () => {
  it('stamps the resolved version alongside the brand kanji', () => {
    render(<SplashMeta version="0.24.0" clock="03:14" />);

    expect(screen.getByText('v0.24.0 · 白波')).toBeInTheDocument();
    expect(screen.getByText('03:14')).toBeInTheDocument();
  });

  it('shows the bare brand kanji while the version query is still in flight', () => {
    render(<SplashMeta version="" clock="03:14" />);

    // Never a dangling `v` — the prefix only appears once a version exists.
    expect(screen.getByText('白波')).toBeInTheDocument();
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
  });

  it('keeps the corner out of the accessibility tree', () => {
    const { container } = render(<SplashMeta version="0.24.0" clock="03:14" />);

    const corner = container.firstElementChild;
    expect(corner).toHaveAttribute('aria-hidden', 'true');
    // The clock ticks every minute; announcing it would be pure noise.
    expect(corner).toHaveClass('absolute', 'right-[30px]', 'top-[26px]');
  });
});
