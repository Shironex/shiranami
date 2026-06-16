import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Search } from 'lucide-react';

import StatusCard from './StatusCard';

describe('StatusCard', () => {
  it('renders the title and description', () => {
    render(
      <StatusCard
        title="No results"
        description="Try a different search term."
        badgeIcon={Search}
      />
    );

    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Try a different search term.')).toBeInTheDocument();
  });

  it('renders children beneath the description', () => {
    render(
      <StatusCard title="Searching…" loading>
        <button type="button">Cancel</button>
      </StatusCard>
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
