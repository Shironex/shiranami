import type { Meta, StoryObj } from '@storybook/react-vite';
import { screen, within, userEvent, expect, waitFor } from 'storybook/test';
import type { SmartPlaylist } from '@shiranami/contracts';

import SmartPlaylistFormDialog from './SmartPlaylistFormDialog';

const samplePlaylist: SmartPlaylist = {
  id: 'sp-1',
  name: 'Late-night focus',
  description: null,
  matchType: 'all',
  rules: [
    { field: 'genre', operator: 'is', value: 'lofi' },
    { field: 'playCount', operator: 'greaterThan', value: '5' },
  ],
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
};

/**
 * smart-playlists · SmartPlaylistFormDialog. The create/edit dialog for a
 * rule-based playlist: a name field, a match-type select ("all" / "any"), a
 * repeatable list of field · operator · value rule rows (add/remove), a live
 * matching-track count, and Cancel / Create (or Save) actions. Driven by
 * `useSmartPlaylistFormDialog`, which seeds the form from the edited playlist or
 * a single blank rule, and only dismisses on a successful save. The dialog
 * renders into a portal, so stories query it via `screen` rather than the canvas.
 */
const meta: Meta<typeof SmartPlaylistFormDialog> = {
  title: 'smart-playlists/SmartPlaylistFormDialog',
  component: SmartPlaylistFormDialog,
  parameters: {
    // Dialog is labelled by its title + described by its description, every
    // select trigger and value input carries an aria-label, the name input is
    // bound to its <label>, and the close button has an sr-only name — axe clean.
    a11y: { test: 'error' },
  },
  args: {
    open: true,
    onOpenChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SmartPlaylistFormDialog>;

/** Create mode — blank name, a single seeded rule row, and a working Add rule. */
export const Default: Story = {
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(
      within(dialog).getByRole('heading', { name: 'New Smart Playlist' })
    ).toBeInTheDocument();

    // Type into the name field (bound to its <label>) and confirm it sticks. A
    // value distinct from the Edit story's seeded name keeps this assertion from
    // passing on leaked cross-story state.
    const name = within(dialog).getByLabelText('Name');
    await userEvent.type(name, 'Deep work sprint');
    await waitFor(() => expect(name).toHaveValue('Deep work sprint'));

    // Adding a rule appends a second field/operator row.
    await expect(within(dialog).getAllByRole('combobox', { name: 'Field' })).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add rule' }));
    await waitFor(() =>
      expect(within(dialog).getAllByRole('combobox', { name: 'Field' })).toHaveLength(2)
    );
  },
};

/** Edit mode — the form is seeded from an existing playlist (name + two rules). */
export const Edit: Story = {
  args: {
    playlist: samplePlaylist,
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(
      within(dialog).getByRole('heading', { name: 'Edit Smart Playlist' })
    ).toBeInTheDocument();
    await expect(within(dialog).getByLabelText('Name')).toHaveValue('Late-night focus');
    // Both seeded rules render as field-select rows.
    await expect(within(dialog).getAllByRole('combobox', { name: 'Field' })).toHaveLength(2);
  },
};
