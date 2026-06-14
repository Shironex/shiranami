import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SearchResult } from '@shiranami/contracts';
import { usePlaylistImportStore } from '@/stores/usePlaylistImportStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import PlaylistImportView from './PlaylistImportView';

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

function seedTracks(results: SearchResult[], sourceTitle: string | null = null): void {
  usePlaylistImportStore.getState().setTracks(results, sourceTitle);
}

beforeEach(() => {
  usePlaylistImportStore.getState().reset();
  useSelectionStore.getState().clearSelection();
});

afterEach(() => {
  usePlaylistImportStore.getState().reset();
  useSelectionStore.getState().clearSelection();
});

describe('PlaylistImportView', () => {
  it('renders the page header and the URL input', () => {
    render(<PlaylistImportView />);

    expect(screen.getByText('Import playlist')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Paste a YouTube or Spotify playlist URL...')
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no results', () => {
    render(<PlaylistImportView />);

    expect(screen.getByText('Import a playlist')).toBeInTheDocument();
  });

  it('renders the action bar with a download-all button once tracks are loaded', () => {
    seedTracks([makeResult({ id: 'a' }), makeResult({ id: 'b' })]);
    render(<PlaylistImportView />);

    expect(screen.getByRole('button', { name: /Download All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Import' })).toBeInTheDocument();
  });

  it('offers to recreate the source playlist when a source title is present', () => {
    seedTracks([makeResult({ id: 'a' })], 'Chillhop Essentials');
    render(<PlaylistImportView />);

    expect(screen.getByText(/Chillhop Essentials/)).toBeInTheDocument();
  });
});
