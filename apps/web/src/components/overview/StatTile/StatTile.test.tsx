import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StatTile from './StatTile';

describe('StatTile', () => {
  it('renders the value and label', () => {
    render(<StatTile kanji="時" value="14h 32m" label="Listened this week" />);

    expect(screen.getByText('14h 32m')).toBeInTheDocument();
    expect(screen.getByText('Listened this week')).toBeInTheDocument();
  });

  it('omits the hint line when no hint is given', () => {
    render(<StatTile kanji="曲" value="128" label="Tracks played" />);

    expect(screen.queryByText(/vs\. last week/)).not.toBeInTheDocument();
  });

  it('tints the hint green for an upward trend', () => {
    render(
      <StatTile
        kanji="時"
        value="14h 32m"
        label="Listened this week"
        hint="+2h 18m vs. last week"
        trend="up"
      />
    );

    const hint = screen.getByText('+2h 18m vs. last week');
    expect(hint).toHaveClass('text-emerald-400/90');
  });
});
