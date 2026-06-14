import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchResult } from '@shiranami/contracts';
import { usePlaylistImportStore } from '@/stores/usePlaylistImportStore';

import PlaylistImportView from './PlaylistImportView';

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

/** Seed the playlist-import store with resolved tracks. */
function seedTracks(results: SearchResult[], sourceTitle: string | null = null): void {
  usePlaylistImportStore.getState().reset();
  usePlaylistImportStore.getState().setTracks(results, sourceTitle);
}

const meta: Meta<typeof PlaylistImportView> = {
  title: 'playlist-import/PlaylistImportView',
  component: PlaylistImportView,
  decorators: [
    Story => (
      <div className="flex h-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistImportView>;

export const Empty: Story = {
  decorators: [
    Story => {
      usePlaylistImportStore.getState().reset();
      return <Story />;
    },
  ],
};

export const WithResults: Story = {
  decorators: [
    Story => {
      seedTracks(
        [
          makeResult({ id: 'a', title: 'Midnight study session' }),
          makeResult({ id: 'b', title: 'Rainy day cafe' }),
          makeResult({ id: 'c', title: 'Slow morning coffee', matchFlag: 'low' }),
        ],
        'Chillhop Essentials'
      );
      return <Story />;
    },
  ],
};
