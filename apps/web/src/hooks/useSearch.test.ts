import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { SearchResult } from '@/types/electron.d';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/hooks/queries/useLibrary', () => ({
  libraryKeys: { all: ['library'] },
}));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { useSearch } from '@/hooks/useSearch';

const fakeResults: SearchResult[] = [
  {
    id: 'vid1',
    title: 'Test Video',
    uploader: 'Test Channel',
    duration: 240,
    thumbnail: 'https://example.com/thumb.jpg',
    url: 'https://youtube.com/watch?v=vid1',
    webpage_url: 'https://youtube.com/watch?v=vid1',
  },
  {
    id: 'vid2',
    title: 'Another Video',
    uploader: 'Another Channel',
    duration: 180,
    thumbnail: 'https://example.com/thumb2.jpg',
    url: 'https://youtube.com/watch?v=vid2',
    webpage_url: 'https://youtube.com/watch?v=vid2',
  },
];

describe('useSearch', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.downloader.search).mockReset();
    vi.mocked(window.electronAPI.downloader.search).mockResolvedValue(fakeResults as never);
  });

  it('has correct initial state', () => {
    const { result } = renderHook(() => useSearch());

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchError).toBeNull();
  });

  it('calls electronAPI.downloader.search and sets results', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('test query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    expect(window.electronAPI.downloader.search).toHaveBeenCalledWith('test query');
    expect(result.current.results).toEqual(fakeResults);
    expect(result.current.isSearching).toBe(false);
  });

  it('sets isSearching true during fetch, false after', async () => {
    let resolveSearch!: (value: SearchResult[]) => void;
    vi.mocked(window.electronAPI.downloader.search).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSearch = resolve;
        })
    );

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('slow query');
    });

    let searchPromise: Promise<void>;
    act(() => {
      searchPromise = result.current.handleSearch();
    });

    // isSearching should be true while waiting
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      resolveSearch(fakeResults);
      await searchPromise!;
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.results).toEqual(fakeResults);
  });

  it('handles errors gracefully', async () => {
    vi.mocked(window.electronAPI.downloader.search).mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('failing query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchError).toBe('Network failure');
    expect(result.current.results).toEqual([]);
  });

  it('sets the noResults flag (not searchError) when results are empty', async () => {
    vi.mocked(window.electronAPI.downloader.search).mockResolvedValue([] as never);

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('no results query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    expect(result.current.results).toEqual([]);
    // Empty results are a typed status, never a translated error string.
    expect(result.current.noResults).toBe(true);
    expect(result.current.searchError).toBeNull();
  });

  it('does not search when query is empty or whitespace', async () => {
    const { result } = renderHook(() => useSearch());

    // Query is empty string by default
    await act(async () => {
      await result.current.handleSearch();
    });

    expect(window.electronAPI.downloader.search).not.toHaveBeenCalled();

    // Set whitespace-only query
    act(() => {
      result.current.setQuery('   ');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    expect(window.electronAPI.downloader.search).not.toHaveBeenCalled();
  });

  it('handleKeyDown triggers search on Enter', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('enter query');
    });

    await act(async () => {
      result.current.handleKeyDown({ key: 'Enter' } as React.KeyboardEvent);
    });

    expect(window.electronAPI.downloader.search).toHaveBeenCalledWith('enter query');
  });

  it('handleKeyDown does not trigger search on other keys', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('some query');
    });

    await act(async () => {
      result.current.handleKeyDown({ key: 'Escape' } as React.KeyboardEvent);
    });

    expect(window.electronAPI.downloader.search).not.toHaveBeenCalled();
  });

  it('getDownloadState returns idle for unknown results', () => {
    const { result } = renderHook(() => useSearch());

    const state = result.current.getDownloadState(fakeResults[0]);
    expect(state).toEqual({ progress: 0, status: 'idle' });
  });
});
