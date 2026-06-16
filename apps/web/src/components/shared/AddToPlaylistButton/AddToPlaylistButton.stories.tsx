import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import AddToPlaylistButton from './AddToPlaylistButton';

function client(): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(playlistKeys.all, []);
  return c;
}

/**
 * shared · AddToPlaylistButton. The small "add to playlist" affordance shown on
 * track-row hover: a ListPlus trigger that, when clicked, opens a portalled
 * popover with the shared PlaylistPickerContent anchored to the button. The
 * trigger is opacity-0 until its parent `.group` is hovered; the decorator
 * forces it visible so it shows in the canvas. Stories wrap it in a QueryClient
 * for the picker.
 */
const meta: Meta<typeof AddToPlaylistButton> = {
  title: 'shared/AddToPlaylistButton',
  component: AddToPlaylistButton,
  args: {
    trackId: 't1',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={client()}>
        <div className="group p-8">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AddToPlaylistButton>;

export const Default: Story = {
  args: {
    className: 'opacity-100',
  },
};
