import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useLibraryStore } from '@/stores/useLibraryStore';

import EditTagsDialog from './EditTagsDialog';

const TRACK = {
  id: 'track-1',
  title: 'Midnight Study Session',
  artist: 'Lofi Collective',
  albumArtist: 'Lofi Collective',
  album: 'Late Nights',
  genre: 'Lofi',
  year: 2024,
  trackNumber: 3,
  discNumber: 1,
  duration: 184,
  filePath: '/music/midnight.mp3',
};

/**
 * shared · EditTagsDialog. A modal form for hand-editing a track's ID3/Vorbis
 * tags (title, artist, album artist, album, genre, year, track #, disc #), with a
 * "writes to file" warning and a saving state on the action. Reads the track from
 * `useLibraryStore` by id and returns null if it isn't found, so the story seeds
 * the library. Rendered open.
 */
const meta: Meta<typeof EditTagsDialog> = {
  title: 'shared/EditTagsDialog',
  component: EditTagsDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trackId: 'track-1',
  },
  beforeEach: () => {
    useLibraryStore.setState({ library: [TRACK] });
  },
};

export default meta;

type Story = StoryObj<typeof EditTagsDialog>;

/** Editing a fully-tagged track — every field is seeded from the library. */
export const Default: Story = {};
