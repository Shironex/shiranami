import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { SearchResult } from '@shiranami/contracts';
import { useSelectionStore } from '@/stores/useSelectionStore';
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

/**
 * playlist-import · PlaylistRow. One virtualized row in the import track list:
 * an index, a selectable thumbnail (preview overlay or a check when selected),
 * the title + uploader with an optional low-confidence badge and a status badge,
 * the duration, the shared download/retry button, and a hover-revealed remove
 * button (pending rows only). Reads selection from `useSelectionStore`. Resolves
 * its track from `tracks[index]` and renders null past the end. Stories pass a
 * one-item list and vary the track status.
 */
const meta: Meta<typeof PlaylistRow> = {
  title: 'playlist-import/PlaylistRow',
  component: PlaylistRow,
  parameters: {
    // The download/retry and remove buttons are aria-labelled and all glyphs
    // are decorative — axe passes clean.
    a11y: { test: 'error' },
  },
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
  // Rows read the shared selection store; start each story unselected so the
  // thumbnail/affordances are deterministic regardless of story order.
  beforeEach: () => {
    useSelectionStore.getState().clearSelection();
  },
};

export default meta;

type Story = StoryObj<typeof PlaylistRow>;

/** Pending — the title, the "Waiting" download button, and a remove affordance. */
export const Default: Story = {
  args: {
    tracks: [makeTrack()],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lofi beats to relax and study to')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Waiting' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Remove from list' })).toBeInTheDocument();
  },
};

/** Downloading — the active progress bar; the remove affordance is gone. */
export const Downloading: Story = {
  args: {
    tracks: [makeTrack({ status: 'downloading', progress: 42 })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Downloading')).toBeInTheDocument();
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    await expect(
      canvas.queryByRole('button', { name: 'Remove from list' })
    ).not.toBeInTheDocument();
  },
};

/** Failed — the error status badge and a labelled retry button. */
export const Failed: Story = {
  args: {
    tracks: [makeTrack({ status: 'error', error: 'yt-dlp exited with code 1' })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/yt-dlp exited with code 1/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Retry download' })).toBeInTheDocument();
  },
};

/** Low confidence — the uncertain-match badge on the meta line. */
export const LowConfidence: Story = {
  args: {
    tracks: [makeTrack({ searchResult: makeResult({ matchFlag: 'low' }) })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Uncertain match')).toBeInTheDocument();
  },
};
