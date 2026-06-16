import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import BulkActionBar from './BulkActionBar';

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

const tracks = [
  makeTrack({ id: 'a', title: 'Midnight study session' }),
  makeTrack({ id: 'b', title: 'Rainy day cafe' }),
  makeTrack({ id: 'c', title: 'Slow morning coffee' }),
];

function seed(selectedIds: string[]): void {
  useLibraryStore.setState({ library: tracks });
  useSelectionStore.setState({
    selectedTrackIds: new Set(selectedIds),
    lastClickedIndex: null,
  });
}

/**
 * shared · BulkActionBar. The floating bottom dock shown while tracks are
 * multi-selected: a selection counter, select-all/clear, Play Next, Add to
 * Queue, favorite toggle, and the destructive Remove/Delete actions. The
 * secondary set is inline at xl+ and collapses into a "More" overflow popover
 * below xl. Reads the selection + library stores and renders nothing when the
 * selection is empty, so stories seed both stores.
 */
const meta: Meta<typeof BulkActionBar> = {
  title: 'shared/BulkActionBar',
  component: BulkActionBar,
  args: {
    trackList: tracks,
  },
  beforeEach: () => {
    seed(['a', 'b']);
  },
};

export default meta;

type Story = StoryObj<typeof BulkActionBar>;

/** A partial selection — the counter reads "2 selected". */
export const Default: Story = {};

/** A playlist-scoped bar exposing the extra "Remove from playlist" action. */
export const InPlaylist: Story = {
  args: {
    trackList: tracks,
    onRemoveFromPlaylist: () => {},
  },
  beforeEach: () => {
    seed(['a', 'b', 'c']);
  },
};
