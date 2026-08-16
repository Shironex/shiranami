import { fireEvent, render, screen } from '@testing-library/react';
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

function resetQueueStore(): void {
  // Reset to the store's initial (pre-hydration) shape.
  useDownloadQueueStore.setState({
    items: [],
    byUrl: new Map(),
    byYoutubeId: new Map(),
    maxConcurrency: 0,
    activeCount: 0,
    paused: false,
    hydrated: false,
    hydrationFailed: false,
  });
}

beforeEach(resetQueueStore);
afterEach(resetQueueStore);

describe('DownloadsView', () => {
  it('holds a skeleton frame before the queue hydrates', () => {
    render(<DownloadsView />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading downloads');
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('No downloads yet')).toBeNull();
  });

  it('shows the error state with a retry action when hydration fails', () => {
    useDownloadQueueStore.getState().markHydrationFailed();
    render(<DownloadsView />);

    expect(screen.getByText("Couldn't load the download queue")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No downloads yet')).toBeNull();
  });

  it('recovers from a failed hydration once a snapshot lands', () => {
    useDownloadQueueStore.getState().markHydrationFailed();
    seedQueue([]);
    render(<DownloadsView />);

    expect(screen.queryByText("Couldn't load the download queue")).toBeNull();
    expect(screen.getByText('No downloads yet')).toBeInTheDocument();
  });

  it('shows the empty state once hydrated with no items', () => {
    seedQueue([]);
    render(<DownloadsView />);

    expect(screen.getByText('No downloads yet')).toBeInTheDocument();
    // The page header stays put across states — only the toolbar goes away.
    expect(screen.getByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause the download queue' })).toBeNull();
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

  it('retries a failed row and the whole failed set through the downloader bridge', () => {
    seedQueue([
      makeItem({ id: 'f', status: 'error', error: 'boom', title: 'Failed track' }),
      makeItem({ id: 'a', status: 'active', title: 'Active track' }),
    ]);
    render(<DownloadsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry download of Failed track' }));
    expect(window.electronAPI.downloader.retryDownload).toHaveBeenCalledWith('f');

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed downloads' }));
    expect(window.electronAPI.downloader.retryAllFailedDownloads).toHaveBeenCalled();
  });

  it('disables the retry-failed header action when nothing failed', () => {
    seedQueue([makeItem({ id: 'a', status: 'active' })]);
    render(<DownloadsView />);

    expect(screen.getByRole('button', { name: 'Retry failed downloads' })).toBeDisabled();
  });

  it('offers no retry affordances when the runtime lacks retry support', () => {
    const downloader = window.electronAPI.downloader as { retryDownload?: unknown };
    const saved = downloader.retryDownload;
    delete downloader.retryDownload;
    try {
      seedQueue([makeItem({ id: 'f', status: 'error', error: 'boom', title: 'Failed track' })]);
      render(<DownloadsView />);

      expect(screen.queryByRole('button', { name: 'Retry failed downloads' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry download of Failed track' })).toBeNull();
    } finally {
      downloader.retryDownload = saved;
    }
  });
});
