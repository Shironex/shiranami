import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Heart, Trash2, X } from 'lucide-react';

import MoreMenu from './MoreMenu';
import type { IOverflowAction } from './MoreMenu.types';

function makeActions(overrides: Partial<Record<string, () => void>> = {}): IOverflowAction[] {
  return [
    {
      key: 'toggleFavorites',
      icon: <Heart className="w-4 h-4" />,
      label: 'Toggle Favorites',
      onClick: overrides.toggleFavorites ?? vi.fn(),
    },
    {
      key: 'removeFromPlaylist',
      icon: <X className="w-4 h-4" />,
      label: 'Remove from Playlist',
      onClick: overrides.removeFromPlaylist ?? vi.fn(),
      variant: 'destructive',
    },
    {
      key: 'removeFromLibrary',
      icon: <Trash2 className="w-4 h-4" />,
      label: 'Remove from Library',
      onClick: overrides.removeFromLibrary ?? vi.fn(),
      variant: 'destructive',
    },
  ];
}

describe('MoreMenu', () => {
  it('renders a collapsed trigger and keeps the popover closed', () => {
    render(<MoreMenu actions={makeActions()} />);

    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('opens a labelled menu with one row per action', async () => {
    const user = userEvent.setup();
    render(<MoreMenu actions={makeActions()} />);

    await user.click(screen.getByRole('button', { name: 'More' }));

    const menu = await screen.findByRole('menu', { name: 'More' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Toggle Favorites',
      'Remove from Playlist',
      'Remove from Library',
    ]);
  });

  it('separates the destructive group with a single divider', async () => {
    const user = userEvent.setup();
    render(<MoreMenu actions={makeActions()} />);

    await user.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('menu');

    // Only the first destructive row opens the group — the second follows on.
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(1);
    expect(separators[0].parentElement).toHaveTextContent('Remove from Playlist');
  });

  it('runs only the chosen action and closes the menu', async () => {
    const user = userEvent.setup();
    const onFavorite = vi.fn();
    const onRemove = vi.fn();
    render(
      <MoreMenu
        actions={makeActions({ toggleFavorites: onFavorite, removeFromLibrary: onRemove })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Toggle Favorites' }));

    expect(onFavorite).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from the keyboard and dismisses on Escape without firing an action', async () => {
    const user = userEvent.setup();
    const onFavorite = vi.fn();
    render(<MoreMenu actions={makeActions({ toggleFavorites: onFavorite })} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onFavorite).not.toHaveBeenCalled();
  });

  it('closes when a mousedown lands outside the trigger and the popover', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outside</button>
        <MoreMenu actions={makeActions()} />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('menu');

    await user.click(screen.getByRole('button', { name: 'Outside' }));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
