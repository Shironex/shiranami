import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TopBarPreview from './TopBarPreview';

describe('TopBarPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<TopBarPreview enabled />);

    expect(screen.getByRole('img', { name: 'Top bar preview' })).toBeInTheDocument();
  });

  it('expands the language chip group when the switcher is enabled', () => {
    render(<TopBarPreview enabled />);

    const chips = screen.getByText('EN').parentElement;
    expect(chips).toHaveClass('max-w-16', 'opacity-100');
    expect(chips).not.toHaveClass('max-w-0');
  });

  it('collapses the language chip group when the switcher is disabled', () => {
    render(<TopBarPreview enabled={false} />);

    // The chips stay mounted so the collapse animates; only the max-width and
    // opacity classes flip.
    const chips = screen.getByText('EN').parentElement;
    expect(chips).toHaveClass('max-w-0', 'opacity-0');
    expect(chips).not.toHaveClass('max-w-16');
  });

  it('renders both language chips regardless of the toggle', () => {
    render(<TopBarPreview enabled={false} />);

    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('PL')).toBeInTheDocument();
  });
});
