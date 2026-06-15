import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { DownloadQueueItem, DownloadQueueStatus } from '@shiranami/contracts';

import DownloadQueueRow from './DownloadQueueRow';

/** Build a realistic queue item; override fields per story. */
function makeItem(overrides: Partial<DownloadQueueItem> = {}): DownloadQueueItem {
  return {
    id: 'item-1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Lofi beats to relax and study to',
    thumbnail: undefined,
    status: 'active',
    progress: 0,
    enqueuedAt: Date.now(),
    ...overrides,
  };
}

/**
 * downloads · DownloadQueueRow. One row in the downloads queue: a thumbnail (or
 * a decorative music glyph fallback), the track title with its lifecycle status,
 * a presentational status button, and — while cancellable — an X cancel button
 * named for the track. Active/converting rows also pin a labelled determinate
 * progress bar to the bottom edge. The status glyph and progress bar carry their
 * own accessible names; the missing-thumbnail icon and fallback glyph are
 * decorative. Stories drive it via the `item` arg.
 */
const meta: Meta<typeof DownloadQueueRow> = {
  title: 'downloads/DownloadQueueRow',
  component: DownloadQueueRow,
  parameters: {
    // Status button + cancel button carry aria-labels, the active progress bar
    // is a named role="progressbar", and the fallback music glyph is a
    // presentational icon — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    onCancel: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DownloadQueueRow>;

/** Active download — title, "Downloading" status, a cancel button, and a progress bar. */
export const Active: Story = {
  args: {
    item: makeItem({ status: 'active', progress: 42 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lofi beats to relax and study to')).toBeInTheDocument();
    // Active rows are cancellable, so the per-track cancel button renders.
    await expect(
      canvas.getByRole('button', { name: 'Cancel download of Lofi beats to relax and study to' })
    ).toBeInTheDocument();
    // Determinate progress is exposed as a named progressbar at the row's value.
    const bar = canvas.getByRole('progressbar', {
      name: 'Download progress for Lofi beats to relax and study to',
    });
    await expect(bar).toHaveAttribute('aria-valuenow', '42');
  },
};

/** Queued download — waiting for a slot, still cancellable, no progress bar. */
export const Queued: Story = {
  args: {
    item: makeItem({ id: 'item-queued', status: 'queued' satisfies DownloadQueueStatus }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Waiting')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Cancel download of Lofi beats to relax and study to' })
    ).toBeInTheDocument();
    // Queued rows show no determinate progress bar.
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
  },
};

/** Finished download — terminal "Downloaded" status, no cancel affordance. */
export const Done: Story = {
  args: {
    item: makeItem({ id: 'item-done', status: 'done', progress: 100 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Downloaded')).toBeInTheDocument();
    // Terminal rows aren't cancellable, so no cancel button renders.
    await expect(canvas.queryByRole('button', { name: /Cancel download/ })).not.toBeInTheDocument();
  },
};

/** Failed download — the raw error is appended to the "Failed" status line. */
export const Errored: Story = {
  args: {
    item: makeItem({
      id: 'item-error',
      status: 'error',
      error: 'yt-dlp exited with code 1',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Failed.*yt-dlp exited with code 1/)).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Cancel download/ })).not.toBeInTheDocument();
  },
};
