import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import SubfolderPlaylistDialog from './SubfolderPlaylistDialog';
import type { ISubfolderEntry } from './SubfolderPlaylistDialog.types';

const subfolders: ISubfolderEntry[] = [
  { name: 'Lofi Beats', path: '/music/Lofi Beats', tracks: [] },
  { name: 'Jazz Nights', path: '/music/Jazz Nights', tracks: [] },
];

function renderDialog(ui: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('SubfolderPlaylistDialog', () => {
  it('renders the detected subfolders when open', () => {
    renderDialog(
      <SubfolderPlaylistDialog
        open
        subfolders={subfolders}
        existingPlaylistNames={new Set()}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />
    );

    expect(screen.getByRole('heading', { name: /Subfolders Detected/i })).toBeInTheDocument();
    expect(screen.getByText('Lofi Beats')).toBeInTheDocument();
    expect(screen.getByText('Jazz Nights')).toBeInTheDocument();
  });

  it('confirms the seeded selection and closes', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(
      <SubfolderPlaylistDialog
        open
        subfolders={subfolders}
        existingPlaylistNames={new Set()}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Create Playlists' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toHaveLength(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
