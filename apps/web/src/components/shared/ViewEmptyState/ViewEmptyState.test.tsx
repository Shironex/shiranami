import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Search } from 'lucide-react';

import ViewEmptyState from './ViewEmptyState';

describe('ViewEmptyState', () => {
  it('renders the title and subtitle', () => {
    render(
      <ViewEmptyState
        title="Nothing here yet"
        subtitle="Search for a track to get started."
        icon={Search}
      />
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Search for a track to get started.')).toBeInTheDocument();
  });
});
