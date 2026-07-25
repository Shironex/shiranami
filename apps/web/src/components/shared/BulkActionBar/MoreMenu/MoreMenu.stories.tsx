import type { Meta, StoryObj } from '@storybook/react-vite';
import { screen, within, userEvent, expect, fn, waitFor } from 'storybook/test';
import { Heart, Trash2, X } from 'lucide-react';

import MoreMenu from './MoreMenu';
import type { IOverflowAction } from './MoreMenu.types';

const toggleFavorites = fn();
const removeFromPlaylist = fn();
const removeFromLibrary = fn();

const actions: IOverflowAction[] = [
  {
    key: 'toggleFavorites',
    icon: <Heart className="w-4 h-4" />,
    label: 'Toggle Favorites',
    onClick: toggleFavorites,
  },
  {
    key: 'removeFromPlaylist',
    icon: <X className="w-4 h-4" />,
    label: 'Remove from Playlist',
    onClick: removeFromPlaylist,
    variant: 'destructive',
  },
  {
    key: 'removeFromLibrary',
    icon: <Trash2 className="w-4 h-4" />,
    label: 'Remove from Library',
    onClick: removeFromLibrary,
    variant: 'destructive',
  },
];

/**
 * shared · BulkActionBar/MoreMenu. The overflow surface of the bulk dock: an
 * icon-only "More" trigger that opens a `role="menu"` popover carrying the
 * actions that do not fit inline below the xl breakpoint. The popover is
 * portalled to `document.body` (so it escapes the dock's `overflow-x-auto`
 * clip) and dismissed by Escape or an outside mousedown; a separator opens the
 * destructive group. Because it portals, stories query it via `screen` rather
 * than the canvas.
 */
const meta: Meta<typeof MoreMenu> = {
  title: 'shared/BulkActionBar/MoreMenu',
  component: MoreMenu,
  parameters: {
    // The trigger is a real <button> with aria-label/aria-haspopup/aria-expanded
    // and the popover is a labelled role="menu" whose rows are role="menuitem"
    // buttons with text names — axe passes clean.
    a11y: { test: 'error' },
  },
  args: { actions },
  beforeEach: () => {
    toggleFavorites.mockClear();
    removeFromPlaylist.mockClear();
    removeFromLibrary.mockClear();
  },
  decorators: [
    Story => (
      <div className="flex justify-end p-8">
        <div className="flex items-center gap-1 rounded-2xl border border-border/50 bg-card/95 px-3 py-2 shadow-2xl">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MoreMenu>;

/** Collapsed — just the trigger, correctly announced as a closed menu button. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'More' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  },
};

/** Open — every collapsed action as a menu row, with the destructive group ruled off. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'More' }));

    const menu = await screen.findByRole('menu', { name: 'More' });
    await expect(menu).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    const rows = within(menu).getAllByRole('menuitem');
    await expect(rows).toHaveLength(3);
    // A single separator opens the destructive group.
    await expect(within(menu).getAllByRole('separator')).toHaveLength(1);
  },
};

/** Choosing a row fires that action alone and dismisses the popover. */
export const SelectsAnAction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'More' }));

    const menu = await screen.findByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Remove from Library' }));

    await expect(removeFromLibrary).toHaveBeenCalledTimes(1);
    await expect(toggleFavorites).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  },
};

/** Keyboard path — the trigger is tabbable, Enter opens, Escape dismisses. */
export const KeyboardDismiss: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'More' });

    await userEvent.tab();
    await expect(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await screen.findByRole('menu');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    // Dismissing must not run an action.
    await expect(toggleFavorites).not.toHaveBeenCalled();
  },
};

/** No destructive action in the set — the menu renders without any separator. */
export const WithoutDestructiveActions: Story = {
  args: {
    actions: [actions[0]],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'More' }));

    const menu = await screen.findByRole('menu');
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    await expect(within(menu).queryByRole('separator')).not.toBeInTheDocument();
  },
};
