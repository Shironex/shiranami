import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof DownloadQueueRow> = {
  title: 'downloads/DownloadQueueRow',
  component: DownloadQueueRow,
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

export const Active: Story = {
  args: {
    item: makeItem({ status: 'active', progress: 42 }),
  },
};

export const Queued: Story = {
  args: {
    item: makeItem({ id: 'item-queued', status: 'queued' satisfies DownloadQueueStatus }),
  },
};

export const Done: Story = {
  args: {
    item: makeItem({ id: 'item-done', status: 'done', progress: 100 }),
  },
};

export const Errored: Story = {
  args: {
    item: makeItem({
      id: 'item-error',
      status: 'error',
      error: 'yt-dlp exited with code 1',
    }),
  },
};
