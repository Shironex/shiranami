import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockFlags = vi.hoisted(() => ({ IS_ELECTRON: true }));

vi.mock('@/lib/platform', () => mockFlags);
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { useSearchDependencies } from '@/hooks/useSearchDependencies';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';

function mockCheckDependencies(result: { ytdlpInstalled: boolean; ffmpegInstalled: boolean }) {
  vi.mocked(window.electronAPI.downloader.checkDependencies).mockResolvedValue(result);
}

function mockInstallDependencies(result: { success: boolean; error?: string }) {
  vi.mocked(window.electronAPI.downloader.installDependencies).mockResolvedValue(result);
}

describe('useSearchDependencies', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFlags.IS_ELECTRON = true;

    vi.mocked(window.electronAPI.downloader.checkDependencies).mockReset();
    vi.mocked(window.electronAPI.downloader.installDependencies).mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();

    // Reset the store between tests
    useDownloadStore.setState({
      isDependencyInstallInProgress: false,
      dependencyInstallProgress: 0,
      dependencyInstallLabel: '',
      dependencyInstallTarget: null,
    });

    // Default: nothing installed
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });
    mockInstallDependencies({ success: true });
  });

  afterEach(async () => {
    // Flush any pending timers (e.g. the 700ms setTimeout in the hook)
    // to prevent unhandled errors after test environment teardown
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // Initial mount and dependency check
  // ---------------------------------------------------------------

  it('starts in checking state and calls checkDependencies on mount', async () => {
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: true });

    const { result } = renderHook(() => useSearchDependencies());

    // Synchronously right after mount it should be 'checking'
    expect(result.current.dependencyState).toBe('checking');
    expect(window.electronAPI.downloader.checkDependencies).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('ready');
    });
  });

  it('transitions to ready when both tools are installed', async () => {
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: true });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('ready');
    });

    expect(result.current.dependenciesSnapshot).toEqual({
      ytdlpInstalled: true,
      ffmpegInstalled: true,
    });
  });

  it('transitions to ready when ytdlp is installed even if ffmpeg is missing', async () => {
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('ready');
    });
  });

  it('transitions to needs-install when ytdlp is missing', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: true });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    expect(result.current.dependenciesSnapshot).toEqual({
      ytdlpInstalled: false,
      ffmpegInstalled: true,
    });
  });

  it('transitions to needs-install when checkDependencies throws', async () => {
    vi.mocked(window.electronAPI.downloader.checkDependencies).mockRejectedValue(
      new Error('IPC failure')
    );

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    expect(result.current.dependenciesSnapshot).toEqual({
      ytdlpInstalled: false,
      ffmpegInstalled: false,
    });
  });

  // ---------------------------------------------------------------
  // handleInstallDependencies: success path
  // ---------------------------------------------------------------

  it('installs dependencies successfully and sets done status', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    // Now make install succeed and post-install check return installed
    mockInstallDependencies({ success: true });
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: true });

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    expect(window.electronAPI.downloader.installDependencies).toHaveBeenCalledTimes(1);
    expect(result.current.dependencyInstallStatus).toBe('done');
    expect(result.current.dependencyInstallError).toBeNull();

    // The hook schedules a 700ms setTimeout to set state to 'ready'
    await waitFor(() => {
      expect(result.current.dependencyState).toBe('ready');
    }, { timeout: 2000 });
  });

  it('shows toast.success when install result is successful', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    mockInstallDependencies({ success: true });
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: true });

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    expect(toast.success).toHaveBeenCalledWith('downloadToolsInstalled', {
      id: 'dependency-install',
    });
  });

  it('shows toast.error when install partially fails (ytdlp ok, ffmpeg failed)', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    mockInstallDependencies({ success: false, error: 'ffmpeg install failed' });
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: false });

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    expect(result.current.dependencyInstallStatus).toBe('done');
    expect(toast.error).toHaveBeenCalledWith('ffmpeg install failed', {
      id: 'dependency-install',
    });
  });

  // ---------------------------------------------------------------
  // handleInstallDependencies: failure paths
  // ---------------------------------------------------------------

  it('sets error state when ytdlp is still missing after install', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    mockInstallDependencies({ success: false, error: 'yt-dlp download failed' });
    // ytdlp still not installed after install attempt
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    expect(result.current.dependencyInstallStatus).toBe('error');
    expect(result.current.dependencyInstallError).toBe('yt-dlp download failed');
    expect(toast.error).toHaveBeenCalled();
  });

  it('handles install throwing an exception', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    vi.mocked(window.electronAPI.downloader.installDependencies).mockRejectedValue(
      new Error('Network timeout')
    );

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    expect(result.current.dependencyInstallStatus).toBe('error');
    expect(result.current.dependencyInstallError).toBe('Network timeout');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('failedInstallSearchError'),
      { id: 'dependency-install' }
    );
  });

  it('handles install throwing a non-Error value', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    vi.mocked(window.electronAPI.downloader.installDependencies).mockRejectedValue(
      'some string error'
    );

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    expect(result.current.dependencyInstallStatus).toBe('error');
    // Falls back to i18n key since it's not an Error instance
    expect(result.current.dependencyInstallError).toBe('installationFailed');
  });

  // ---------------------------------------------------------------
  // Store integration: startDependencyInstall / stopDependencyInstall
  // ---------------------------------------------------------------

  it('resets store isDependencyInstallInProgress after successful install', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    mockInstallDependencies({ success: true });
    mockCheckDependencies({ ytdlpInstalled: true, ffmpegInstalled: true });

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    // After install completes, stopDependencyInstall resets the store
    const storeState = useDownloadStore.getState();
    expect(storeState.isDependencyInstallInProgress).toBe(false);
  });

  it('resets store isDependencyInstallInProgress even when install throws', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    vi.mocked(window.electronAPI.downloader.installDependencies).mockRejectedValue(
      new Error('fail')
    );

    await act(async () => {
      await result.current.handleInstallDependencies();
    });

    // stopDependencyInstall should have been called in finally block
    const storeState = useDownloadStore.getState();
    expect(storeState.isDependencyInstallInProgress).toBe(false);
  });

  // ---------------------------------------------------------------
  // Default return values
  // ---------------------------------------------------------------

  it('returns initial install status as idle', async () => {
    const { result } = renderHook(() => useSearchDependencies());

    expect(result.current.dependencyInstallStatus).toBe('idle');
    expect(result.current.dependencyInstallError).toBeNull();
    expect(result.current.dependenciesSnapshot).toBeNull();

    // Let the mount effect settle to avoid act() warnings
    await waitFor(() => {
      expect(result.current.dependencyState).not.toBe('checking');
    });
  });

  it('exposes store progress values', async () => {
    mockCheckDependencies({ ytdlpInstalled: false, ffmpegInstalled: false });

    const { result } = renderHook(() => useSearchDependencies());

    await waitFor(() => {
      expect(result.current.dependencyState).toBe('needs-install');
    });

    expect(result.current.isDependencyInstallInProgress).toBe(false);
    expect(result.current.dependencyInstallProgress).toBe(0);
    expect(result.current.dependencyInstallTarget).toBeNull();
  });

  // ---------------------------------------------------------------
  // Non-electron environment
  // ---------------------------------------------------------------

  describe('non-electron environment', () => {
    beforeEach(() => {
      mockFlags.IS_ELECTRON = false;
    });

    it('does not call checkDependencies when not in electron', async () => {
      const { result } = renderHook(() => useSearchDependencies());

      // Give a tick for any async effects
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(window.electronAPI.downloader.checkDependencies).not.toHaveBeenCalled();
      expect(result.current.dependencyState).toBe('checking');
    });

    it('handleInstallDependencies is a no-op outside electron', async () => {
      const { result } = renderHook(() => useSearchDependencies());

      await act(async () => {
        await result.current.handleInstallDependencies();
      });

      expect(window.electronAPI.downloader.installDependencies).not.toHaveBeenCalled();
    });
  });
});
