import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { SearchResult } from '@shiranami/contracts';
import { usePlaylistImportStore } from '@/stores/usePlaylistImportStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

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

/**
 * playlist-import · PlaylistImportView. The playlist-import surface: a page
 * header, a URL field + Extract control, extraction progress / error states,
 * a download / cancel / reset action row once tracks resolve, and either the
 * empty state or a virtualized list of `PlaylistRow`s. Reads the
 * `usePlaylistImportStore` (tracks, extraction state) and `useSelectionStore`;
 * stories seed the store so the view renders deterministically without IPC.
 */
const meta: Meta<typeof PlaylistImportView> = {
  title: 'playlist-import/PlaylistImportView',
  component: PlaylistImportView,
  parameters: {
    // The page title is a real <h1>, the URL field is a labelled textbox, and
    // controls are labelled buttons — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
  // The view + its rows read the shared selection store; start unselected.
  beforeEach: () => {
    useSelectionStore.getState().clearSelection();
  },
};

export default meta;

type Story = StoryObj<typeof PlaylistImportView>;

/** Empty — the header, URL field, and the "import a playlist" empty state. */
export const Empty: Story = {
  decorators: [
    Story => {
      usePlaylistImportStore.getState().reset();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Import playlist' })).toBeInTheDocument();
    await expect(
      canvas.getByPlaceholderText(/Paste a YouTube or Spotify playlist URL/)
    ).toBeInTheDocument();
    await expect(canvas.getByText('Import a playlist')).toBeInTheDocument();
  },
};

/** With results — the resolved track list plus the download-all action row. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Midnight study session')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Download All/ })).toBeInTheDocument();
  },
};
