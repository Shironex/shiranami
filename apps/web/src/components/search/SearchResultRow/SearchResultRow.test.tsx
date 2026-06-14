import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import type { SearchResult } from '@/types/electron';
import type { DownloadState } from '@/hooks/useSearch';

import SearchResultRow from './SearchResultRow';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'vid-1',
    title: 'Test Song',
    uploader: 'Test Artist',
    duration: 210,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=abc',
    webpage_url: 'https://www.youtube.com/watch?v=abc',
    view_count: 1000,
    ...overrides,
  } as SearchResult;
}

function makeState(overrides: Partial<DownloadState> = {}): DownloadState {
  return { progress: 0, status: 'idle', ...overrides };
}

function renderRow(
  overrides: {
    result?: Partial<SearchResult>;
    downloadState?: Partial<DownloadState>;
    previewLoadingId?: string | null;
    isPreviewPlaying?: (result: SearchResult) => boolean;
    onPreview?: (result: SearchResult) => void;
    onDownload?: (result: SearchResult) => void;
  } = {}
) {
  const result = makeResult(overrides.result);
  const onDownload = overrides.onDownload ?? vi.fn();
  const onPreview = overrides.onPreview ?? vi.fn();
  return {
    result,
    onDownload,
    onPreview,
    ...render(
      <SearchResultRow
        result={result}
        downloadState={makeState(overrides.downloadState)}
        previewLoadingId={overrides.previewLoadingId ?? null}
        isPreviewPlaying={overrides.isPreviewPlaying ?? (() => false)}
        onPreview={onPreview}
        onDownload={onDownload}
      />
    ),
  };
}

describe('SearchResultRow', () => {
  it('renders the title and uploader', () => {
    renderRow({ result: { title: 'First Track', uploader: 'Artist A' } });

    expect(screen.getByText('First Track')).toBeInTheDocument();
    expect(screen.getByText(/Artist A/)).toBeInTheDocument();
  });

  it('shows the Music fallback icon when no thumbnail is provided', () => {
    const { container } = renderRow();

    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the thumbnail when a URL is present', () => {
    const { container } = renderRow({
      result: { thumbnail: 'https://example.com/cover.jpg' },
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('shows a determinate progress bar while downloading', () => {
    renderRow({ downloadState: { status: 'downloading', progress: 42 } });

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '42');
  });

  it('calls onPreview when the thumbnail button is clicked', () => {
    const onPreview = vi.fn();
    const { result } = renderRow({ onPreview });

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    expect(onPreview).toHaveBeenCalledWith(result);
  });

  it('calls onDownload when the download button is clicked', () => {
    const onDownload = vi.fn();
    const { result } = renderRow({ onDownload });

    fireEvent.click(screen.getByRole('button', { name: /Download Test Song/ }));

    expect(onDownload).toHaveBeenCalledWith(result);
  });
});
