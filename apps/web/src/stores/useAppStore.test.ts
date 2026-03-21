import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      activeView: 'library',
      rightPanel: null,
      selectedPlaylistId: null,
      sidebarCollapsed: false,
      compactMode: false,
      compactAlwaysOnTop: false,
      showVisualizer: true,
      visualizerStyle: 'bars',
    });
    vi.mocked(window.electronAPI.window.setCompactMode).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockResolvedValue(undefined);
  });

  it('persists compact always-on-top to localStorage', async () => {
    await useAppStore.getState().setCompactAlwaysOnTop(true);
    expect(localStorage.getItem('shiranami.compact-always-on-top')).toBe('true');
  });

  it('rolls back compact mode when Electron setCompactMode fails', async () => {
    vi.mocked(window.electronAPI.window.setCompactMode).mockRejectedValueOnce(new Error('ipc failed'));

    await useAppStore.getState().setCompactMode(true);

    expect(useAppStore.getState().compactMode).toBe(false);
  });

  it('rolls back compact always-on-top and localStorage when setAlwaysOnTop fails in compact mode', async () => {
    await useAppStore.getState().setCompactMode(true);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockRejectedValueOnce(new Error('aot failed'));

    await useAppStore.getState().setCompactAlwaysOnTop(true);

    expect(useAppStore.getState().compactAlwaysOnTop).toBe(false);
    expect(localStorage.getItem('shiranami.compact-always-on-top')).toBe('false');
  });
});
