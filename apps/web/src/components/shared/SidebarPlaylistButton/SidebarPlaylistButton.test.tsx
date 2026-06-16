import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import type { Playlist } from '@/types/electron';

import SidebarPlaylistButton from './SidebarPlaylistButton';

const playlist: Playlist = {
  id: 'pl-42',
  name: 'Rainy Day Cafe',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('SidebarPlaylistButton', () => {
  it('renders the playlist name inline when expanded', () => {
    render(
      <SidebarPlaylistButton
        playlist={playlist}
        collapsed={false}
        isActive={false}
        onNavigate={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('Rainy Day Cafe')).toBeInTheDocument();
  });

  it('navigates to the playlist when clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <SidebarPlaylistButton
        playlist={playlist}
        collapsed={false}
        isActive={false}
        onNavigate={onNavigate}
        onContextMenu={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('pl-42');
  });

  it('exposes the name via aria-label and omits inline text when collapsed', () => {
    render(
      <SidebarPlaylistButton
        playlist={playlist}
        collapsed
        isActive={false}
        onNavigate={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Rainy Day Cafe' });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('p')).toBeNull();
  });
});
