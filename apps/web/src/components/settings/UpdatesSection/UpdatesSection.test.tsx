import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import UpdatesSection from './UpdatesSection';

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UpdatesSection />
    </QueryClientProvider>
  );
}

describe('UpdatesSection', () => {
  it('renders the updates card with the check button (Windows flow)', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Updates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument();
  });

  it('shows the idle status message by default', () => {
    renderSection();

    expect(screen.getByText('No updates available')).toBeInTheDocument();
  });
});
