import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { SmartPlaylist } from '@shiranami/contracts';

import SmartPlaylistFormDialog from './SmartPlaylistFormDialog';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makePlaylist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: 'sp-1',
    name: 'Late-night focus',
    description: null,
    matchType: 'all',
    rules: [{ field: 'genre', operator: 'is', value: 'lofi' }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('SmartPlaylistFormDialog', () => {
  it('renders nothing while closed', () => {
    renderWithClient(<SmartPlaylistFormDialog open={false} onOpenChange={() => {}} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the create title and a blank rule row when opened without a playlist', () => {
    renderWithClient(<SmartPlaylistFormDialog open onOpenChange={() => {}} />);

    expect(screen.getByText('New Smart Playlist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
  });

  it('seeds the name field from the edited playlist', () => {
    renderWithClient(
      <SmartPlaylistFormDialog open onOpenChange={() => {}} playlist={makePlaylist()} />
    );

    expect(screen.getByText('Edit Smart Playlist')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Late-night focus')).toBeInTheDocument();
  });

  it('cancel closes the dialog', async () => {
    const onOpenChange = vi.fn();
    renderWithClient(<SmartPlaylistFormDialog open onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
