import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/lib/scanHelpers', () => ({
  scanAndPersistFolder: vi.fn(async () => ({ addedCount: 0, subfolders: [] })),
}));

import { toast } from 'sonner';
import { scanAndPersistFolder } from '@/lib/scanHelpers';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import type { Track } from '@/stores/types';

const folders = [
  { id: 'a', path: '/music/a', lastScanned: null, createdAt: '' },
  { id: 'b', path: '/music/b', lastScanned: null, createdAt: '' },
];

function track(id: string, filePath: string): Track {
  return { id, filePath, title: id } as Track;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useLibraryRescan folder scope', () => {
  beforeEach(() => {
    vi.mocked(scanAndPersistFolder).mockClear();
    vi.mocked(toast.info).mockClear();
    vi.mocked(window.electronAPI.db.folders.getAll).mockResolvedValue(folders);
    vi.mocked(window.electronAPI.library.validateFiles).mockReset();
    vi.mocked(window.electronAPI.library.validateFiles).mockResolvedValue([]);
    useLibraryStore
      .getState()
      .setLibrary([track('1', '/music/a/one.mp3'), track('2', '/music/b/two.mp3')]);
  });

  it('scans and validates only the requested folders', async () => {
    const { result } = renderHook(() => useLibraryRescan(), { wrapper });

    await act(async () => {
      await result.current.rescan({ folderIds: ['b'], quiet: true });
    });

    expect(vi.mocked(scanAndPersistFolder).mock.calls.map(([path]) => path)).toEqual(['/music/b']);
    expect(window.electronAPI.library.validateFiles).toHaveBeenCalledWith(['/music/b/two.mp3']);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('a full rescan still covers everything and says when nothing changed', async () => {
    const { result } = renderHook(() => useLibraryRescan(), { wrapper });

    await act(async () => {
      await result.current.rescan();
    });

    expect(scanAndPersistFolder).toHaveBeenCalledTimes(2);
    expect(window.electronAPI.library.validateFiles).toHaveBeenCalledWith([
      '/music/a/one.mp3',
      '/music/b/two.mp3',
    ]);
    expect(toast.info).toHaveBeenCalledWith('libraryUpToDate');
  });
});

describe('useLibraryRescan watcher deletion guards', () => {
  const b = folders[1];

  /** Validation answers: these track paths missing, and these roots missing. */
  function validation(missingTracks: string[], missingRoots: string[] = []) {
    vi.mocked(window.electronAPI.library.validateFiles).mockImplementation(async paths =>
      paths.filter(path => missingTracks.includes(path) || missingRoots.includes(path))
    );
  }

  async function watcherRescan() {
    const { result } = renderHook(() => useLibraryRescan(), { wrapper });
    await act(async () => {
      await result.current.rescan({ folderIds: [b.id], quiet: true });
    });
  }

  beforeEach(() => {
    vi.mocked(scanAndPersistFolder).mockReset();
    vi.mocked(scanAndPersistFolder).mockResolvedValue({
      addedCount: 0,
      subfolders: [],
      empty: false,
      allExisted: true,
    });
    vi.mocked(window.electronAPI.db.folders.getAll).mockResolvedValue(folders);
    vi.mocked(window.electronAPI.db.tracks.removeMany).mockClear();
    useLibraryStore
      .getState()
      .setLibrary([
        track('1', '/music/b/one.mp3'),
        track('2', '/music/b/two.mp3'),
        track('3', '/music/b/three.mp3'),
      ]);
  });

  it('deletes one genuinely deleted file among present ones', async () => {
    validation(['/music/b/two.mp3']);

    await watcherRescan();

    expect(window.electronAPI.db.tracks.removeMany).toHaveBeenCalledWith(['2']);
  });

  it('deletes nothing when the root vanished between the batch and validation', async () => {
    validation(['/music/b/two.mp3'], [b.path]);

    await watcherRescan();

    expect(window.electronAPI.db.tracks.removeMany).not.toHaveBeenCalled();
  });

  it('deletes nothing when the scan came back empty while the folder has tracks', async () => {
    vi.mocked(scanAndPersistFolder).mockResolvedValue({
      addedCount: 0,
      subfolders: [],
      empty: true,
      allExisted: false,
    });
    validation(['/music/b/two.mp3']);

    await watcherRescan();

    expect(window.electronAPI.db.tracks.removeMany).not.toHaveBeenCalled();
  });

  it('deletes nothing when every tracked file under the folder reads as missing', async () => {
    validation(['/music/b/one.mp3', '/music/b/two.mp3', '/music/b/three.mp3']);

    await watcherRescan();

    expect(window.electronAPI.db.tracks.removeMany).not.toHaveBeenCalled();
  });

  /** Validation that sees `blip` missing on its first call only. */
  function blipOnFirstPass(blip: string) {
    let calls = 0;
    vi.mocked(window.electronAPI.library.validateFiles).mockImplementation(async paths => {
      calls += 1;
      return calls === 1 ? paths.filter(path => path === blip) : [];
    });
  }

  it('keeps a file that was missing on the first pass but back on the second', async () => {
    blipOnFirstPass('/music/b/two.mp3');

    await watcherRescan();

    expect(window.electronAPI.db.tracks.removeMany).not.toHaveBeenCalled();
  });

  it('a manual rescan also re-checks before deleting', async () => {
    blipOnFirstPass('/music/b/two.mp3');
    const { result } = renderHook(() => useLibraryRescan(), { wrapper });

    await act(async () => {
      await result.current.rescan();
    });

    expect(window.electronAPI.db.tracks.removeMany).not.toHaveBeenCalled();
  });

  it('a manual rescan keeps its old behaviour', async () => {
    vi.mocked(scanAndPersistFolder).mockResolvedValue({
      addedCount: 0,
      subfolders: [],
      empty: true,
      allExisted: false,
    });
    validation(['/music/b/one.mp3', '/music/b/two.mp3', '/music/b/three.mp3']);
    const { result } = renderHook(() => useLibraryRescan(), { wrapper });

    await act(async () => {
      await result.current.rescan();
    });

    expect(window.electronAPI.db.tracks.removeMany).toHaveBeenCalledWith(['1', '2', '3']);
  });
});
