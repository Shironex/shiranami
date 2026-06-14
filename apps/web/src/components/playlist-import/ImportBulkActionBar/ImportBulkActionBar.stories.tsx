import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchResult } from '@shiranami/contracts';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

import ImportBulkActionBar from './ImportBulkActionBar';

function makeTrack(id: string, status: PlaylistTrack['status'] = 'pending'): PlaylistTrack {
  const searchResult: SearchResult = {
    id: `result-${id}`,
    title: `Track ${id}`,
    uploader: 'Lofi Girl',
    duration: 184,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  return { id, searchResult, status, progress: 0 };
}

const TRACKS: PlaylistTrack[] = [makeTrack('a'), makeTrack('b'), makeTrack('c')];

/** Seed a selection so the bar renders, then clear it on unmount. */
function withSelection(ids: string[]) {
  return function Decorator(Story: () => React.ReactElement) {
    useEffect(() => {
      useSelectionStore.setState({ selectedTrackIds: new Set(ids), lastClickedIndex: null });
      return () => useSelectionStore.getState().clearSelection();
    }, []);
    return <Story />;
  };
}

const meta: Meta<typeof ImportBulkActionBar> = {
  title: 'playlist-import/ImportBulkActionBar',
  component: ImportBulkActionBar,
  args: {
    tracks: TRACKS,
    isImporting: false,
    onDownloadSelected: () => {},
    onRemoveSelected: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ImportBulkActionBar>;

export const Default: Story = {
  decorators: [withSelection(['a', 'b'])],
};

export const AllSelected: Story = {
  decorators: [withSelection(['a', 'b', 'c'])],
};

export const Importing: Story = {
  args: { isImporting: true },
  decorators: [withSelection(['a', 'b'])],
};
