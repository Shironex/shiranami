import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { PreviewableItem } from '@/hooks/useAudioPreview';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { useAudioPreview } from '@/hooks/useAudioPreview';
import { toast } from 'sonner';

const fakeItem: PreviewableItem = {
  id: 'abc123',
  title: 'Test Song',
  uploader: 'Test Artist',
  duration: 200,
  thumbnail: 'https://example.com/thumb.jpg',
  url: 'https://youtube.com/watch?v=abc123',
  webpage_url: 'https://youtube.com/watch?v=abc123',
};

const fakeItem2: PreviewableItem = {
  id: 'def456',
  title: 'Another Song',
  uploader: 'Another Artist',
  duration: 180,
  thumbnail: 'https://example.com/thumb2.jpg',
  url: 'https://youtube.com/watch?v=def456',
};

describe('useAudioPreview', () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      currentTrack: null,
      isPlaying: false,
      queue: [],
      queueIndex: 0,
    });
    vi.mocked(window.electronAPI.downloader.getStreamUrl).mockReset();
    vi.mocked(window.electronAPI.downloader.getStreamUrl).mockResolvedValue(
      'https://stream.example.com/audio.mp3'
    );
    vi.mocked(toast.error).mockReset();
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useAudioPreview());

    expect(result.current.previewLoadingId).toBeNull();
    expect(typeof result.current.handlePreview).toBe('function');
    expect(typeof result.current.isPreviewPlaying).toBe('function');
  });

  it('handlePreview fetches stream URL and sets queue with preview track', async () => {
    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    expect(window.electronAPI.downloader.getStreamUrl).toHaveBeenCalledWith(fakeItem.webpage_url);

    const state = usePlaybackStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]).toMatchObject({
      id: `preview-${fakeItem.id}`,
      title: fakeItem.title,
      artist: fakeItem.uploader,
      duration: fakeItem.duration,
      albumArt: fakeItem.thumbnail,
    });
    expect(state.queue[0].filePath).toContain('shiranami-radio://stream?url=');
    expect(state.queue[0].filePath).toContain(
      encodeURIComponent('https://stream.example.com/audio.mp3')
    );
  });

  it('uses item.url when webpage_url is not provided', async () => {
    const itemNoWebpage: PreviewableItem = {
      ...fakeItem,
      webpage_url: undefined,
    };

    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(itemNoWebpage);
    });

    expect(window.electronAPI.downloader.getStreamUrl).toHaveBeenCalledWith(itemNoWebpage.url);
  });

  it('toggles play when the same preview track is already current', async () => {
    usePlaybackStore.setState({
      currentTrack: {
        id: `preview-${fakeItem.id}`,
        title: fakeItem.title,
        artist: fakeItem.uploader,
        album: 'previewSource',
        duration: fakeItem.duration,
        filePath: 'shiranami-radio://stream?url=test',
      },
      isPlaying: true,
    });

    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    // Should toggle, not fetch a new stream
    expect(window.electronAPI.downloader.getStreamUrl).not.toHaveBeenCalled();
    // isPlaying should have been toggled (was true, now false)
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it('isPreviewPlaying returns true when the preview track is playing', () => {
    usePlaybackStore.setState({
      currentTrack: {
        id: `preview-${fakeItem.id}`,
        title: fakeItem.title,
        artist: fakeItem.uploader,
        album: 'previewSource',
        duration: fakeItem.duration,
        filePath: 'shiranami-radio://stream?url=test',
      },
      isPlaying: true,
    });

    const { result } = renderHook(() => useAudioPreview());

    expect(result.current.isPreviewPlaying({ id: fakeItem.id })).toBe(true);
  });

  it('isPreviewPlaying returns false when no track is playing', () => {
    const { result } = renderHook(() => useAudioPreview());

    expect(result.current.isPreviewPlaying({ id: fakeItem.id })).toBe(false);
  });

  it('isPreviewPlaying returns false when a different track is playing', () => {
    usePlaybackStore.setState({
      currentTrack: {
        id: `preview-${fakeItem2.id}`,
        title: fakeItem2.title,
        artist: fakeItem2.uploader,
        album: 'previewSource',
        duration: fakeItem2.duration,
        filePath: 'shiranami-radio://stream?url=test',
      },
      isPlaying: true,
    });

    const { result } = renderHook(() => useAudioPreview());

    expect(result.current.isPreviewPlaying({ id: fakeItem.id })).toBe(false);
  });

  it('isPreviewPlaying returns false when track matches but is paused', () => {
    usePlaybackStore.setState({
      currentTrack: {
        id: `preview-${fakeItem.id}`,
        title: fakeItem.title,
        artist: fakeItem.uploader,
        album: 'previewSource',
        duration: fakeItem.duration,
        filePath: 'shiranami-radio://stream?url=test',
      },
      isPlaying: false,
    });

    const { result } = renderHook(() => useAudioPreview());

    expect(result.current.isPreviewPlaying({ id: fakeItem.id })).toBe(false);
  });

  it('sets previewLoadingId during fetch and clears it after', async () => {
    let resolveStream!: (value: string) => void;
    vi.mocked(window.electronAPI.downloader.getStreamUrl).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveStream = resolve;
        })
    );

    const { result } = renderHook(() => useAudioPreview());

    let previewPromise: Promise<void>;
    act(() => {
      previewPromise = result.current.handlePreview(fakeItem);
    });

    // Loading ID should be set while fetching
    expect(result.current.previewLoadingId).toBe(fakeItem.id);

    await act(async () => {
      resolveStream('https://stream.example.com/audio.mp3');
      await previewPromise!;
    });

    // Loading ID should be cleared after fetch completes
    expect(result.current.previewLoadingId).toBeNull();
  });

  it('shows error toast and clears loading state on fetch failure', async () => {
    vi.mocked(window.electronAPI.downloader.getStreamUrl).mockRejectedValue(
      new Error('Stream unavailable')
    );

    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    expect(toast.error).toHaveBeenCalledWith('previewFailed');
    expect(result.current.previewLoadingId).toBeNull();
  });

  it('shows error toast with unknownError for non-Error exceptions', async () => {
    vi.mocked(window.electronAPI.downloader.getStreamUrl).mockRejectedValue('some string error');

    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    expect(toast.error).toHaveBeenCalledWith('previewFailed');
    expect(result.current.previewLoadingId).toBeNull();
  });

  it('uses custom albumLabel when provided', async () => {
    const { result } = renderHook(() => useAudioPreview('Custom Album'));

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    const state = usePlaybackStore.getState();
    expect(state.queue[0].album).toBe('Custom Album');
  });

  it('uses default albumLabel from i18n when not provided', async () => {
    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    const state = usePlaybackStore.getState();
    // i18n.t mock returns the key as-is
    expect(state.queue[0].album).toBe('previewSource');
  });

  it('sets albumArt to undefined when thumbnail is not provided', async () => {
    const itemNoThumb: PreviewableItem = {
      ...fakeItem,
      thumbnail: undefined,
    };

    const { result } = renderHook(() => useAudioPreview());

    await act(async () => {
      await result.current.handlePreview(itemNoThumb);
    });

    const state = usePlaybackStore.getState();
    expect(state.queue[0].albumArt).toBeUndefined();
  });
});

describe('useAudioPreview (non-Electron)', () => {
  it('handlePreview does nothing when not in Electron', async () => {
    // The IS_ELECTRON guard is a module-level constant, so we need full
    // module isolation: reset all cached modules, then re-mock platform
    // with IS_ELECTRON=false before dynamically importing the hook.
    vi.resetModules();

    vi.doMock('@/lib/platform', () => ({ IS_ELECTRON: false }));
    vi.doMock('sonner', () => ({
      toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@/lib/i18n', () => ({
      default: { t: (key: string) => key },
    }));

    const { useAudioPreview: useAudioPreviewNonElectron } = await import('@/hooks/useAudioPreview');

    // Reset the electronAPI mock so we can assert it was never called
    vi.mocked(window.electronAPI.downloader.getStreamUrl).mockReset();

    const { result } = renderHook(() => useAudioPreviewNonElectron());

    await act(async () => {
      await result.current.handlePreview(fakeItem);
    });

    expect(window.electronAPI.downloader.getStreamUrl).not.toHaveBeenCalled();
    expect(result.current.previewLoadingId).toBeNull();
  });
});
