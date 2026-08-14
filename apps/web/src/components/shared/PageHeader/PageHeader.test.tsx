import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Library } from 'lucide-react';

import PageHeader from './PageHeader';

describe('PageHeader', () => {
  it('renders an h1 in the page variant', () => {
    render(<PageHeader title="Library" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
  });

  it('renders an h2 with a subtitle in the section variant', () => {
    render(<PageHeader variant="section" icon={Library} title="Albums" subtitle="24 albums" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Albums' })).toBeInTheDocument();
    expect(screen.getByText('24 albums')).toBeInTheDocument();
  });

  it('renders the actions slot on the trailing edge in both variants', () => {
    const { rerender } = render(
      <PageHeader title="Library" actions={<button type="button">New</button>} />
    );

    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();

    rerender(
      <PageHeader
        variant="section"
        icon={Library}
        title="Albums"
        actions={<button type="button">Import</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });
});
