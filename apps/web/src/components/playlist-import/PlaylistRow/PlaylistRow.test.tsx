import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '@shiranami/contracts';
import type { RowComponentProps } from 'react-window';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

import PlaylistRow from './PlaylistRow';
import type { IPlaylistRowProps } from './PlaylistRow.types';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'result-1',
    title: 'Lofi beats',
    uploader: 'Lofi Girl',
    duration: 184,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return {
    id: 'track-1',
    searchResult: makeResult(),
    status: 'pending',
    progress: 0,
    ...overrides,
  };
}

function renderRow(track: PlaylistTrack, overrides: Partial<IPlaylistRowProps> = {}) {
  const props = {
    index: 0,
    style: undefined,
    tracks: [track],
    isImporting: false,
    previewLoadingId: null,
    isPreviewPlaying: () => false,
    handlePreview: vi.fn(),
    handleRemoveTrack: vi.fn(),
    handleDownloadTrack: vi.fn(),
    ...overrides,
  } as unknown as RowComponentProps<IPlaylistRowProps>;
  return { props, ...render(<PlaylistRow {...props} />) };
}

afterEach(() => {
  useSelectionStore.getState().clearSelection();
});

describe('PlaylistRow', () => {
  it('renders the title, uploader, and 1-based row index', () => {
    renderRow(makeTrack());

    expect(screen.getByText('Lofi beats')).toBeInTheDocument();
    expect(screen.getByText('Lofi Girl')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('appends the error message to the status badge when the track failed', () => {
    renderRow(makeTrack({ status: 'error', error: 'yt-dlp exited with code 1' }));

    expect(screen.getByText(/Failed: yt-dlp exited with code 1/)).toBeInTheDocument();
  });

  it('shows the low-confidence badge for a low-confidence match', () => {
    renderRow(makeTrack({ searchResult: makeResult({ matchFlag: 'low' }) }));

    expect(screen.getByText('Uncertain match')).toBeInTheDocument();
  });

  it('removes the track when the remove button is clicked', () => {
    const handleRemoveTrack = vi.fn();
    renderRow(makeTrack({ id: 'abc' }), { handleRemoveTrack });

    fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));

    expect(handleRemoveTrack).toHaveBeenCalledWith('abc');
  });

  it('hides the remove button while importing', () => {
    renderRow(makeTrack(), { isImporting: true });

    expect(screen.queryByRole('button', { name: 'Remove from list' })).toBeNull();
  });

  it('previews the track on a plain row click', () => {
    const handlePreview = vi.fn();
    const track = makeTrack();
    renderRow(track, { handlePreview });

    fireEvent.click(screen.getByText('Lofi beats'));

    expect(handlePreview).toHaveBeenCalledWith(track.searchResult);
  });
});
