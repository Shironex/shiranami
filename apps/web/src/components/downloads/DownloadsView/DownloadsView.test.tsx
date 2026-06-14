import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DownloadQueueItem, DownloadQueueSnapshot } from '@shiranami/contracts';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';

import DownloadsView from './DownloadsView';

function makeItem(overrides: Partial<DownloadQueueItem> = {}): DownloadQueueItem {
  return {
    id: 'item-1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Lofi beats',
    status: 'active',
    progress: 0,
    enqueuedAt: 0,
    ...overrides,
  };
}

function seedQueue(items: DownloadQueueItem[], paused = false): void {
  const snapshot: DownloadQueueSnapshot = {
    items,
    maxConcurrency: 3,
    activeCount: items.filter(i => i.status === 'active').length,
    paused,
  };
  useDownloadQueueStore.getState().applySnapshot(snapshot);
}

beforeEach(() => {
  // Reset to the store's initial (pre-hydration) shape before each test.
  useDownloadQueueStore.setState({
    items: [],
    byUrl: new Map(),
    byYoutubeId: new Map(),
    maxConcurrency: 0,
    activeCount: 0,
    paused: false,
    hydrated: false,
  });
});

afterEach(() => {
  useDownloadQueueStore.setState({
    items: [],
    byUrl: new Map(),
    byYoutubeId: new Map(),
    maxConcurrency: 0,
    activeCount: 0,
    paused: false,
    hydrated: false,
  });
});

describe('DownloadsView', () => {
  it('holds a blank loading frame before the queue hydrates', () => {
    render(<DownloadsView />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading downloads');
    expect(screen.queryByText('No downloads yet')).toBeNull();
  });

  it('shows the empty state once hydrated with no items', () => {
    seedQueue([]);
    render(<DownloadsView />);

    expect(screen.getByText('No downloads yet')).toBeInTheDocument();
  });

  it('renders grouped sections and their items', () => {
    seedQueue([
      makeItem({ id: 'a', status: 'active', title: 'Active track' }),
      makeItem({ id: 'q', status: 'queued', title: 'Queued track' }),
      makeItem({ id: 'd', status: 'done', title: 'Done track' }),
    ]);
    render(<DownloadsView />);

    expect(screen.getByText('Active track')).toBeInTheDocument();
    expect(screen.getByText('Queued track')).toBeInTheDocument();
    expect(screen.getByText('Done track')).toBeInTheDocument();

    // Section headings render with their counts ("Active · 1" etc).
    expect(screen.getByText(/Active · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Queued · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Completed · 1/)).toBeInTheDocument();
  });

  it('shows the paused banner when the queue is paused', () => {
    seedQueue([makeItem({ id: 'a', status: 'active' })], true);
    render(<DownloadsView />);

    expect(screen.getByText(/Queue paused/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume the download queue' })).toBeInTheDocument();
  });
});
