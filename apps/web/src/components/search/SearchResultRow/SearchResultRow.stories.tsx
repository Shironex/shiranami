import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { SearchResult } from '@/types/electron';
import type { DownloadState } from '@/hooks/useSearch';

import SearchResultRow from './SearchResultRow';

/** Build a realistic search result; override fields per story. */
function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'vid-1',
    title: 'Lofi beats to relax and study to',
    uploader: 'Lofi Girl',
    duration: 210,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    view_count: 1_240_000,
    ...overrides,
  } as SearchResult;
}

function makeState(overrides: Partial<DownloadState> = {}): DownloadState {
  return { progress: 0, status: 'idle', ...overrides };
}

/**
 * search · SearchResultRow. One row in the YouTube results list: a preview
 * toggle over the thumbnail, the track title + uploader / view-count meta line
 * (which swaps to a status subtitle while downloading / done / errored), the
 * duration, and the shared download-progress button. Downloading rows add a
 * determinate progress bar. Stories cover each download state and drive a
 * download click.
 */
const meta: Meta<typeof SearchResultRow> = {
  title: 'search/SearchResultRow',
  component: SearchResultRow,
  parameters: {
    // The preview and download buttons are aria-labelled, the progress bar
    // carries its role, and the thumbnail image is named by the track title —
    // axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    previewLoadingId: null,
    isPreviewPlaying: () => false,
    onPreview: fn(),
    onDownload: fn(),
  },
  decorators: [
    Story => (
      <div className="w-[34rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SearchResultRow>;

/** Idle — preview + download affordances; clicking download fires `onDownload`. */
export const Default: Story = {
  args: {
    result: makeResult(),
    downloadState: makeState(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lofi beats to relax and study to')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Preview' })).toBeInTheDocument();

    const download = canvas.getByRole('button', {
      name: 'Download Lofi beats to relax and study to',
    });
    await userEvent.click(download);
    await expect(args.onDownload).toHaveBeenCalled();
  },
};

/** Downloading — the status subtitle + a determinate progress bar. */
export const Downloading: Story = {
  args: {
    result: makeResult({ id: 'vid-dl', title: 'Midnight study session' }),
    downloadState: makeState({ status: 'downloading', progress: 42 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Adding…')).toBeInTheDocument();
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  },
};

/** Done — the "in your library" subtitle; the download button reads as added. */
export const Done: Story = {
  args: {
    result: makeResult({ id: 'vid-done', title: 'Warm evening lights' }),
    downloadState: makeState({ status: 'done', progress: 100 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('In your library')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Warm evening lights added to your library' })
    ).toBeInTheDocument();
  },
};

/** Errored — the retry affordance with the error subtitle. */
export const Errored: Story = {
  args: {
    result: makeResult({ id: 'vid-err', title: 'Broken stream' }),
    downloadState: makeState({ status: 'error', error: 'Network timeout' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Couldn't add · retry")).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Retry adding Broken stream' })
    ).toBeInTheDocument();
  },
};
