import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '@shiranami/contracts';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

import ImportBulkActionBar from './ImportBulkActionBar';

function makeTrack(id: string, status: PlaylistTrack['status'] = 'pending'): PlaylistTrack {
  const searchResult: SearchResult = {
    id: `result-${id}`,
    title: `Track ${id}`,
    uploader: 'Lofi Girl',
    duration: 184,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  return { id, searchResult, status, progress: 0 };
}

const TRACKS: PlaylistTrack[] = [makeTrack('a'), makeTrack('b'), makeTrack('c')];

function selectTracks(ids: string[]): void {
  useSelectionStore.setState({ selectedTrackIds: new Set(ids), lastClickedIndex: null });
}

afterEach(() => {
  useSelectionStore.getState().clearSelection();
});

describe('ImportBulkActionBar', () => {
  it('renders nothing when no tracks are selected', () => {
    const { container } = render(
      <ImportBulkActionBar
        tracks={TRACKS}
        isImporting={false}
        onDownloadSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('shows the selected count and bulk actions when tracks are selected', () => {
    selectTracks(['a', 'b']);
    render(
      <ImportBulkActionBar
        tracks={TRACKS}
        isImporting={false}
        onDownloadSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
      />
    );

    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('downloads the selected tracks and clears the selection', () => {
    const onDownloadSelected = vi.fn();
    selectTracks(['a', 'b']);
    render(
      <ImportBulkActionBar
        tracks={TRACKS}
        isImporting={false}
        onDownloadSelected={onDownloadSelected}
        onRemoveSelected={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Download/ }));

    expect(onDownloadSelected).toHaveBeenCalledWith(new Set(['a', 'b']));
    expect(useSelectionStore.getState().selectedTrackIds.size).toBe(0);
  });

  it('removes the selected tracks and clears the selection', () => {
    const onRemoveSelected = vi.fn();
    selectTracks(['a', 'b']);
    render(
      <ImportBulkActionBar
        tracks={TRACKS}
        isImporting={false}
        onDownloadSelected={vi.fn()}
        onRemoveSelected={onRemoveSelected}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));

    expect(onRemoveSelected).toHaveBeenCalledWith(new Set(['a', 'b']));
    expect(useSelectionStore.getState().selectedTrackIds.size).toBe(0);
  });

  it('hides the mutating actions while importing', () => {
    selectTracks(['a', 'b']);
    render(
      <ImportBulkActionBar
        tracks={TRACKS}
        isImporting={true}
        onDownloadSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove selected' })).toBeNull();
  });
});
