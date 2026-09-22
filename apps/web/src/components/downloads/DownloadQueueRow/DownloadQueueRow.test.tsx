import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DownloadQueueItem } from '@shiranami/contracts';

import DownloadQueueRow from './DownloadQueueRow';

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

describe('DownloadQueueRow', () => {
  it('renders the title and the localized status label', () => {
    render(
      <DownloadQueueRow item={makeItem({ status: 'done', progress: 100 })} onCancel={vi.fn()} />
    );

    expect(screen.getByText('Lofi beats')).toBeInTheDocument();
    expect(screen.getByText('Downloaded')).toBeInTheDocument();
  });

  it('appends the error message to the status line when the download failed', () => {
    render(
      <DownloadQueueRow
        item={makeItem({ status: 'error', error: 'yt-dlp exited with code 1' })}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/Failed: yt-dlp exited with code 1/)).toBeInTheDocument();
  });

  it('shows the Music fallback icon when no thumbnail is provided', () => {
    const { container } = render(<DownloadQueueRow item={makeItem()} onCancel={vi.fn()} />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the thumbnail and falls back to the icon when it fails to load', () => {
    const { container } = render(
      <DownloadQueueRow
        item={makeItem({ thumbnail: 'https://example.com/cover.jpg' })}
        onCancel={vi.fn()}
      />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');

    fireEvent.error(img!);

    expect(container.querySelector('img')).toBeNull();
  });

  it('calls onCancel with the item id when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <DownloadQueueRow item={makeItem({ id: 'abc', status: 'queued' })} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel download of/ }));

    expect(onCancel).toHaveBeenCalledWith('abc');
  });

  it('does not render a cancel button for terminal statuses', () => {
    render(<DownloadQueueRow item={makeItem({ status: 'done' })} onCancel={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Cancel download of/ })).toBeNull();
  });

  it('calls onRetry with the item id when the retry button on a failed row is clicked', () => {
    const onRetry = vi.fn();
    render(
      <DownloadQueueRow
        item={makeItem({ id: 'abc', status: 'error', error: 'boom' })}
        onCancel={vi.fn()}
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Retry download of/ }));

    expect(onRetry).toHaveBeenCalledWith('abc');
  });

  it('renders no retry button on non-failed rows, or when the runtime has no retry support', () => {
    const { rerender } = render(
      <DownloadQueueRow item={makeItem({ status: 'done' })} onCancel={vi.fn()} onRetry={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /Retry download of/ })).toBeNull();

    // A failed row without an onRetry handler (legacy runtime) stays action-less.
    rerender(<DownloadQueueRow item={makeItem({ status: 'error' })} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Retry download of/ })).toBeNull();
  });
});
