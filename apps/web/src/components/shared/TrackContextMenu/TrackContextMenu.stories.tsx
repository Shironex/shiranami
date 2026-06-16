import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import TrackContextMenu from './TrackContextMenu';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 184,
    filePath: '/music/midnight.mp3',
    albumArt: undefined,
    isFavorite: false,
    ...overrides,
  } as Track;
}

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const track = makeTrack();

/**
 * shared · TrackContextMenu. The right-click menu for a library track: Play Next
 * / Add to Queue, More like this, Not interested, an Add-to-Playlist submenu,
 * favorite toggle, Share, Find missing metadata, Edit tags, Show in folder, and
 * the destructive Remove / Delete actions. Portalled to document.body at the
 * click position and dismissed on outside-click, Escape, or scroll. When the
 * right-clicked track is part of a multi-selection it switches to bulk mode.
 * Reads the library + selection stores and uses react-query for its IPC actions,
 * so stories seed the stores and wrap it in a QueryClient.
 */
const meta: Meta<typeof TrackContextMenu> = {
  title: 'shared/TrackContextMenu',
  component: TrackContextMenu,
  args: {
    track,
    position: { x: 24, y: 24 },
    onClose: () => {},
  },
  beforeEach: () => {
    useLibraryStore.setState({ library: [track] });
    useSelectionStore.setState({ selectedTrackIds: new Set(), lastClickedIndex: null });
  },
  decorators: [
    Story => (
      <QueryClientProvider client={client()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TrackContextMenu>;

/** A single-track menu — the full action set with no bulk header. */
export const Default: Story = {};

/** A multi-selection that includes the right-clicked track shows the bulk header. */
export const Bulk: Story = {
  beforeEach: () => {
    const tracks = [track, makeTrack({ id: 'track-2', title: 'Rainy day cafe' })];
    useLibraryStore.setState({ library: tracks });
    useSelectionStore.setState({
      selectedTrackIds: new Set(tracks.map(t => t.id)),
      lastClickedIndex: null,
    });
  },
};
