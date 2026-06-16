import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Playlist } from '@/types/electron';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistPickerContent from './PlaylistPickerContent';

function makePlaylist(id: string, name: string): Playlist {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  };
}

/**
 * Each story owns a QueryClient seeded with a playlist list and the target
 * track's membership so the picker settles on its real list (instead of the IPC
 * loading spinner) in the browser run.
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
 * shared · PlaylistPickerContent. The playlist-membership picker body shared by
 * the AddToPlaylistButton popover and the TrackContextMenu submenu: a scrollable
 * list of playlists (a check marks the ones the target track already belongs to)
 * plus an inline "New playlist" create-and-add form. Reads/writes via the
 * playlist react-query hooks; stories seed a QueryClient. Membership writes are
 * IPC no-ops in the browser run.
 */
const meta: Meta<typeof PlaylistPickerContent> = {
  title: 'shared/PlaylistPickerContent',
  component: PlaylistPickerContent,
  args: {
    trackIds: ['t1'],
    onDone: () => {},
  },
  decorators: [
    Story => (
      <QueryClientProvider client={client()}>
        <div className="w-48 rounded-xl bg-card border border-border/50 py-1">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistPickerContent>;

export const Default: Story = {};
