import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import ImportDialog from './ImportDialog';

function renderDialog(ui: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ImportDialog', () => {
  it('renders the import title and rests in the loading state when open', () => {
    renderDialog(<ImportDialog open onOpenChange={vi.fn()} code="abc123" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Import Shared Music')).toBeInTheDocument();
    // Without a live backend the import hook stays in its loading frame.
    expect(screen.getByText('Loading shared content...')).toBeInTheDocument();
  });

  it('does not render its contents when closed', () => {
    renderDialog(<ImportDialog open={false} onOpenChange={vi.fn()} code="abc123" />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
