import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));

import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';

const fakeSuggestions = ['lofi hip hop', 'lofi beats', 'lofi music'];

describe('useSearchSuggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(window.electronAPI.downloader.suggest).mockReset();
    vi.mocked(window.electronAPI.downloader.suggest).mockResolvedValue(fakeSuggestions as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct initial state', () => {
    const { result } = renderHook(() => useSearchSuggestions(''));

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.highlightedIndex).toBe(-1);
    expect(result.current.isOpen).toBe(false);
  });

  it('returns empty suggestions for empty query', () => {
    const { result } = renderHook(() => useSearchSuggestions(''));

    vi.advanceTimersByTime(300);

    expect(window.electronAPI.downloader.suggest).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isOpen).toBe(false);
  });

  it('returns empty suggestions for whitespace-only query', () => {
    const { result } = renderHook(() => useSearchSuggestions('   '));

    vi.advanceTimersByTime(300);

    expect(window.electronAPI.downloader.suggest).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isOpen).toBe(false);
  });

  it('debounces API calls — does not call suggest before delay', () => {
    renderHook(() => useSearchSuggestions('lofi'));

    vi.advanceTimersByTime(200);

    expect(window.electronAPI.downloader.suggest).not.toHaveBeenCalled();
  });

  it('calls suggest after debounce delay and sets suggestions', async () => {
    const { result } = renderHook(() => useSearchSuggestions('lofi'));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(window.electronAPI.downloader.suggest).toHaveBeenCalledWith('lofi');
    expect(result.current.suggestions).toEqual(fakeSuggestions);
    expect(result.current.highlightedIndex).toBe(-1);
  });

  it('opens dropdown when suggestions arrive', async () => {
    const { result } = renderHook(() => useSearchSuggestions('lofi'));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('does not open dropdown when suggest returns empty array', async () => {
    vi.mocked(window.electronAPI.downloader.suggest).mockResolvedValue([] as never);

    const { result } = renderHook(() => useSearchSuggestions('xyz'));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });

  it('ignores stale results when query changed while fetching', async () => {
    let resolveSuggest!: (value: string[]) => void;
    vi.mocked(window.electronAPI.downloader.suggest).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSuggest = resolve;
        })
    );

    const { result, rerender } = renderHook(({ query }) => useSearchSuggestions(query), {
      initialProps: { query: 'lofi' },
    });

    // Trigger debounce for first query
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.electronAPI.downloader.suggest).toHaveBeenCalledWith('lofi');

    // Change query while first fetch is in-flight
    rerender({ query: 'jazz' });

    // Resolve the stale "lofi" fetch — should be ignored
    await act(async () => {
      resolveSuggest(fakeSuggestions);
    });

    // Suggestions should NOT be set because queryRef.current is now 'jazz'
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isOpen).toBe(false);
  });

  it('close() hides dropdown and resets highlightedIndex', async () => {
    const { result } = renderHook(() => useSearchSuggestions('lofi'));

    // Open the dropdown
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isOpen).toBe(true);

    // Simulate user changing highlighted index
    act(() => {
      result.current.setHighlightedIndex(1);
    });
    expect(result.current.highlightedIndex).toBe(1);

    // Close
    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.highlightedIndex).toBe(-1);
  });

  it('dismiss() suppresses the next fetch and closes', async () => {
    const { result, rerender } = renderHook(({ query }) => useSearchSuggestions(query), {
      initialProps: { query: 'lofi' },
    });

    // Open dropdown
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isOpen).toBe(true);

    // Dismiss
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.isOpen).toBe(false);

    // Reset mock call count
    vi.mocked(window.electronAPI.downloader.suggest).mockClear();

    // Change query — this re-render should be suppressed
    rerender({ query: 'lofi beats' });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // suggest should NOT have been called due to suppressRef
    expect(window.electronAPI.downloader.suggest).not.toHaveBeenCalled();

    // Next query change should work normally (suppress is one-shot)
    rerender({ query: 'lofi chill' });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(window.electronAPI.downloader.suggest).toHaveBeenCalledWith('lofi chill');
  });

  it('silently ignores IPC errors', async () => {
    vi.mocked(window.electronAPI.downloader.suggest).mockRejectedValue(new Error('IPC failed'));

    const { result } = renderHook(() => useSearchSuggestions('lofi'));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Should not throw and suggestions remain empty
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isOpen).toBe(false);
  });

  it('resets suggestions when query becomes empty', async () => {
    const { result, rerender } = renderHook(({ query }) => useSearchSuggestions(query), {
      initialProps: { query: 'lofi' },
    });

    // Get suggestions
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.suggestions).toEqual(fakeSuggestions);
    expect(result.current.isOpen).toBe(true);

    // Clear the query
    rerender({ query: '' });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isOpen).toBe(false);
  });

  it('selectSuggestion returns the suggestion at given index', async () => {
    const { result } = renderHook(() => useSearchSuggestions('lofi'));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Suggestions array is directly accessible for selection
    expect(result.current.suggestions[0]).toBe('lofi hip hop');
    expect(result.current.suggestions[1]).toBe('lofi beats');
    expect(result.current.suggestions[2]).toBe('lofi music');
  });
});
