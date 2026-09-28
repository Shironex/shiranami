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
