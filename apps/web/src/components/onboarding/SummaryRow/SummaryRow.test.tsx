import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Palette } from 'lucide-react';

import SummaryRow from './SummaryRow';

/** Rows are always composed inside the Summary step's labelled recap list. */
function renderInList(row: ReactNode): void {
  render(
    <div role="list" aria-label="Your setup choices">
      {row}
    </div>
  );
}

describe('SummaryRow', () => {
  it('renders the label and value as one recap list item', () => {
    renderInList(<SummaryRow icon={<Palette />} label="Theme" value="Snow" />);

    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Theme')).toBeInTheDocument();
    expect(within(item).getByText('Snow')).toBeInTheDocument();
  });

  it('keeps the leading glyph out of the accessibility tree', () => {
    renderInList(
      <SummaryRow icon={<Palette data-testid="row-icon" />} label="Theme" value="Snow" />
    );

    const glyph = screen.getByTestId('row-icon');
    expect(glyph.parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the value in the default foreground tint', () => {
    renderInList(<SummaryRow icon={<Palette />} label="Crash reports" value="OFF" />);

    expect(screen.getByText('OFF')).toHaveClass('text-foreground');
  });

  it('accents the value when the choice is highlighted', () => {
    renderInList(<SummaryRow icon={<Palette />} label="Crash reports" value="ON" highlight />);

    const value = screen.getByText('ON');
    expect(value).toHaveClass('text-primary');
    expect(value).not.toHaveClass('text-foreground');
  });
});
