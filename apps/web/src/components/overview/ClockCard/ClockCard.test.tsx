import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ClockCard from './ClockCard';

describe('ClockCard', () => {
  it('exposes a stable accessible time label on the container', () => {
    render(<ClockCard />);

    expect(screen.getByRole('group', { name: /Current time/ })).toBeInTheDocument();
  });

  it('renders the injected weather row in place of the mood line', () => {
    render(<ClockCard weatherRow={<p>Rain · 12°C</p>} glyph="雨" />);

    expect(screen.getByText('Rain · 12°C')).toBeInTheDocument();
    expect(screen.getByText('雨')).toBeInTheDocument();
  });

  it('falls back to a time-of-day mood line when no weather row is given', () => {
    const { container } = render(<ClockCard />);

    // The mood line lives in the bottom row next to the glyph.
    expect(container.querySelector('.border-t p')).not.toBeNull();
  });
});
