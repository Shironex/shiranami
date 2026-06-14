import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DownloadQueueItem, DownloadQueueSnapshot } from '@shiranami/contracts';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';

import DownloadsView from './DownloadsView';

function makeItem(overrides: Partial<DownloadQueueItem> = {}): DownloadQueueItem {
  return {
    id: 'item-1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Lofi beats to relax and study to',
    status: 'active',
    progress: 0,
    enqueuedAt: Date.now(),
    ...overrides,
  };
}

/** Seed the renderer mirror of the download queue used by the view. */
function seedQueue(items: DownloadQueueItem[], paused = false): void {
  const snapshot: DownloadQueueSnapshot = {
    items,
    maxConcurrency: 3,
    activeCount: items.filter(i => i.status === 'active').length,
    paused,
  };
  useDownloadQueueStore.getState().applySnapshot(snapshot);
}

const meta: Meta<typeof DownloadsView> = {
  title: 'downloads/DownloadsView',
  component: DownloadsView,
  decorators: [
    Story => (
      <div className="flex h-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DownloadsView>;

export const Default: Story = {
  decorators: [
    Story => {
      seedQueue([
        makeItem({ id: 'a', status: 'active', progress: 64, title: 'Midnight study session' }),
        makeItem({ id: 'q1', status: 'queued', title: 'Rainy day cafe' }),
        makeItem({ id: 'q2', status: 'queued', title: 'Slow morning coffee' }),
        makeItem({ id: 'd', status: 'done', progress: 100, title: 'Warm evening lights' }),
        makeItem({ id: 'e', status: 'error', title: 'Broken stream', error: 'Network timeout' }),
      ]);
      return <Story />;
    },
  ],
};

export const Paused: Story = {
  decorators: [
    Story => {
      seedQueue(
        [
          makeItem({ id: 'a', status: 'active', progress: 12, title: 'Lo-fi hip hop radio' }),
          makeItem({ id: 'q', status: 'queued', title: 'Chillhop essentials' }),
        ],
        true
      );
      return <Story />;
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      seedQueue([]);
      return <Story />;
    },
  ],
};
