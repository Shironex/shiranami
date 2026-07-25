import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import type { Playlist } from '@/types/electron';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistSubmenu from './PlaylistSubmenu';

function makePlaylist(id: string, name: string): Playlist {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  };
}

/**
 * Seeded with a playlist list and the target track's membership so the picker
 * settles on its real rows instead of the IPC loading spinner in the browser run.
 */
function client(): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(playlistKeys.all, [
    makePlaylist('p1', 'Late night'),
    makePlaylist('p2', 'Focus flow'),
  ]);
  c.setQueryData([...playlistKeys.all, 'membership', ['t1']], ['p1']);
  return c;
}

/**
 * shared · TrackContextMenu/PlaylistSubmenu. The "Add to Playlist" row of the
 * track context menu plus its hover fly-out, which hosts the shared
 * PlaylistPickerContent. The panel opens to the right and flips left when the
 * row sits within its own width of the viewport edge; leaving the row starts a
 * 300 ms grace period so a diagonal pointer path into the panel does not dismiss
 * it.
 *
 * The row is a pointer-driven affordance with no keyboard trigger of its own —
 * it is a child of the context menu, which owns Escape/outside-click dismissal —
 * so the play functions drive it by hover. Focus behaviour that does belong here
 * (the picker's inline create form autofocusing its name input) is asserted in
 * `CreatesFromTheFlyOut`.
 */
const meta: Meta<typeof PlaylistSubmenu> = {
  title: 'shared/TrackContextMenu/PlaylistSubmenu',
  component: PlaylistSubmenu,
  parameters: {
    // The row is plain labelled text and the fly-out holds real <button> rows
    // with text names — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    trackIds: ['t1'],
    onClose: () => {},
  },
  decorators: [
    Story => (
      <QueryClientProvider client={client()}>
        <div className="w-[200px] rounded-xl border border-border/50 bg-card py-1">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistSubmenu>;

/** Collapsed — the labelled row with its chevron, no fly-out mounted. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Add to Playlist')).toBeInTheDocument();
    await expect(canvas.queryByText('Late night')).not.toBeInTheDocument();
  },
};

/** Hovering the row opens the fly-out with the playlist picker inside. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText('Add to Playlist'));

    await expect(await canvas.findByText('Late night')).toBeInTheDocument();
    await expect(canvas.getByText('Focus flow')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'New Playlist' })).toBeInTheDocument();
  },
};

/** Leaving the row closes the fly-out after its grace period. */
export const ClosesAfterGracePeriod: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByText('Add to Playlist');

    await userEvent.hover(row);
    await canvas.findByText('Late night');

    await userEvent.unhover(row);
    // The 300 ms grace period elapses on its own — waitFor spans it.
    await waitFor(() => expect(canvas.queryByText('Late night')).not.toBeInTheDocument());
  },
};

/** The picker's inline create form opens from the fly-out and takes focus. */
export const CreatesFromTheFlyOut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByText('Add to Playlist'));

    const newPlaylist = await canvas.findByRole('button', { name: 'New Playlist' });
    await userEvent.click(newPlaylist);

    const input = await canvas.findByRole('textbox', { name: 'Name...' });
    await expect(input).toHaveFocus();
    // The fly-out survives the interaction — the pointer never left the row.
    await expect(canvas.getByText('Late night')).toBeInTheDocument();
  },
};
