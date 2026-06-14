import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchResult } from '@shiranami/contracts';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

import PlaylistRow from './PlaylistRow';

/** Build a realistic search result; override fields per story. */
function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'result-1',
    title: 'Lofi beats to relax and study to',
    uploader: 'Lofi Girl',
    duration: 184,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...overrides,
  };
}

/** Build a playlist track wrapping a search result. */
function makeTrack(overrides: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return {
    id: 'track-1',
    searchResult: makeResult(),
    status: 'pending',
    progress: 0,
    ...overrides,
  };
}

const meta: Meta<typeof PlaylistRow> = {
  title: 'playlist-import/PlaylistRow',
  component: PlaylistRow,
  args: {
    index: 0,
    style: { position: 'relative', height: 52 },
    isImporting: false,
    previewLoadingId: null,
    isPreviewPlaying: () => false,
    handlePreview: () => {},
    handleRemoveTrack: () => {},
    handleDownloadTrack: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistRow>;

export const Default: Story = {
  args: {
    tracks: [makeTrack()],
  },
};

export const Downloading: Story = {
  args: {
    tracks: [makeTrack({ status: 'downloading', progress: 42 })],
  },
};

export const Failed: Story = {
  args: {
    tracks: [makeTrack({ status: 'error', error: 'yt-dlp exited with code 1' })],
  },
};

export const LowConfidence: Story = {
  args: {
    tracks: [makeTrack({ searchResult: makeResult({ matchFlag: 'low' }) })],
  },
};
