import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, within, userEvent, expect, fn, waitFor } from 'storybook/test';

import SubfolderPlaylistDialog from './SubfolderPlaylistDialog';
import type { ISubfolderEntry } from './SubfolderPlaylistDialog.types';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const subfolders: ISubfolderEntry[] = [
  { name: 'Lofi Beats', path: '/music/Lofi Beats', tracks: [] },
  { name: 'Jazz Nights', path: '/music/Jazz Nights', tracks: [] },
  { name: 'Focus', path: '/music/Focus', tracks: [] },
];

/**
 * settings · SubfolderPlaylistDialog. The post-scan prompt offering to turn each
 * detected subfolder into a playlist: a checkbox row per subfolder (track count
 * shown, rows whose name already exists are disabled + flagged), a select-all /
 * deselect-all toggle, and Skip / Create Playlists actions. Confirm is disabled
 * when nothing is selected. Renders into a portal, so stories query it via
 * `screen` rather than the canvas.
 */
const meta: Meta<typeof SubfolderPlaylistDialog> = {
  title: 'settings/SubfolderPlaylistDialog',
  component: SubfolderPlaylistDialog,
  // a11y stays at the global 'todo' default: the per-row Radix Checkbox is a
  // `<button role="checkbox">` wrapped in a `<label>`, but a <button> is not a
  // labelable element, so each checkbox ends up without an accessible name (axe
  // aria-input-field-name). The fix belongs in SubfolderPlaylistDialog.tsx,
  // which is out of scope for this story pass, so axe is left non-blocking here.
  parameters: { a11y: { test: 'todo' } },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SubfolderPlaylistDialog>;

/** Three fresh subfolders — all selected by default, Create is enabled. */
export const Default: Story = {
  args: {
    open: true,
    subfolders,
    existingPlaylistNames: new Set(),
    onOpenChange: fn(),
    onConfirm: fn(),
  },
  play: async ({ args }) => {
    // The dialog renders into a portal — query it from the document.
    const dialog = await screen.findByRole('dialog');
    await expect(within(dialog).getByText('Subfolders Detected')).toBeInTheDocument();

    // Each subfolder is offered as a checkbox row, all selected on open.
    const checkboxes = within(dialog).getAllByRole('checkbox');
    await expect(checkboxes).toHaveLength(3);
    for (const box of checkboxes) await expect(box).toBeChecked();

    // Create is enabled with a selection; clicking confirms + closes.
    const create = within(dialog).getByRole('button', { name: 'Create Playlists' });
    await expect(create).toBeEnabled();
    await userEvent.click(create);
    await waitFor(() => expect(args.onConfirm).toHaveBeenCalledTimes(1));
    // The confirmed selection carries all three fresh subfolders.
    expect((args.onConfirm as ReturnType<typeof fn>).mock.calls[0][0]).toHaveLength(3);
  },
};

/** A colliding name — the existing-playlist row is disabled and flagged. */
export const SomeAlreadyExist: Story = {
  args: {
    open: true,
    subfolders,
    existingPlaylistNames: new Set(['Focus']),
    onOpenChange: fn(),
    onConfirm: fn(),
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    // The clashing subfolder surfaces the "already exists" flag...
    await expect(within(dialog).getByText('Playlist already exists')).toBeInTheDocument();
    // ...and its checkbox is disabled, so only the two fresh rows stay selectable.
    const checkboxes = within(dialog).getAllByRole('checkbox');
    const disabled = checkboxes.filter(
      box => box.hasAttribute('disabled') || box.getAttribute('data-disabled') !== null
    );
    await expect(disabled).toHaveLength(1);
  },
};
