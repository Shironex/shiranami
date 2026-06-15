import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
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
  // applySnapshot also flips `hydrated` true, so the view leaves its blank
  // loading frame and renders the real queue (or the empty state).
  useDownloadQueueStore.getState().applySnapshot(snapshot);
}

/**
 * downloads · DownloadsView. The Downloads screen: an `<h1>` title with
 * pause/resume, cancel-all (a confirm popover), and clear-completed actions,
 * then the queue grouped into Active / Queued / Completed `<h2>` sections of
 * `DownloadQueueRow`s. Reads the renderer-side `useDownloadQueueStore` mirror of
 * the main-process queue; holds a blank loading frame until the first snapshot
 * lands, then shows either the grouped sections or an empty state. Cancellation,
 * pause, and clear are IPC no-ops in the browser run. Stories seed the store.
 */
const meta: Meta<typeof DownloadsView> = {
  title: 'downloads/DownloadsView',
  component: DownloadsView,
  parameters: {
    // Title is a real <h1>, sections are <h2>, every toolbar button is labelled,
    // and queue rows expose their own names — axe passes clean.
    a11y: { test: 'error' },
  },
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

/** A populated queue across every section, with the toolbar actions live. */
export const Default: Story = {
  beforeEach: () => {
    seedQueue([
      makeItem({ id: 'a', status: 'active', progress: 64, title: 'Midnight study session' }),
      makeItem({ id: 'q1', status: 'queued', title: 'Rainy day cafe' }),
      makeItem({ id: 'q2', status: 'queued', title: 'Slow morning coffee' }),
      makeItem({ id: 'd', status: 'done', progress: 100, title: 'Warm evening lights' }),
      makeItem({ id: 'e', status: 'error', title: 'Broken stream', error: 'Network timeout' }),
    ]);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();
    // Grouped section headings carry their counts.
    await expect(canvas.getByRole('heading', { name: /Active · 1/ })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: /Queued · 2/ })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: /Completed · 2/ })).toBeInTheDocument();
    // With pending work the pause/cancel-all actions are enabled.
    await expect(canvas.getByRole('button', { name: 'Pause the download queue' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'Cancel all downloads' })).toBeEnabled();
  },
};

/** A paused queue — the banner shows and the toolbar offers Resume. */
export const Paused: Story = {
  beforeEach: () => {
    seedQueue(
      [
        makeItem({ id: 'a', status: 'active', progress: 12, title: 'Lo-fi hip hop radio' }),
        makeItem({ id: 'q', status: 'queued', title: 'Chillhop essentials' }),
      ],
      true
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Queue paused/)).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Resume the download queue' })
    ).toBeInTheDocument();
  },
};

/** Hydrated with no items — the empty state replaces the queue. */
export const Empty: Story = {
  beforeEach: () => {
    seedQueue([]);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No downloads yet')).toBeInTheDocument();
    // No queue chrome renders in the empty state.
    await expect(canvas.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  },
};
