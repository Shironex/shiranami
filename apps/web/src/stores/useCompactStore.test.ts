import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompactStore } from './useCompactStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

const STORE_KEY = 'shiranami.compact-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe('useCompactStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCompactStore.setState({
      compactMode: false,
      compactAlwaysOnTop: false,
      compactSize: 'md',
      compactFontSize: 'md',
      compactAmbientIntensity: 0.08,
      compactShowAlbumArt: true,
      compactShowAlbum: true,
      compactShowSeek: true,
      compactShowVolume: true,
      compactShowFavorite: false,
      compactDefaultAlwaysOnTop: false,
    });
    vi.mocked(window.electronAPI.window.setCompactMode).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockResolvedValue(undefined);
  });

  it('persists compact always-on-top to localStorage', async () => {
    await useCompactStore.getState().setCompactAlwaysOnTop(true);
    expect(useCompactStore.getState().compactAlwaysOnTop).toBe(true);
    expect(readPersisted().compactAlwaysOnTop).toBe(true);
  });

  it('rolls back compact mode when Electron setCompactMode fails', async () => {
    vi.mocked(window.electronAPI.window.setCompactMode).mockRejectedValueOnce(
      new Error('ipc failed')
    );

    await useCompactStore.getState().setCompactMode(true);

    expect(useCompactStore.getState().compactMode).toBe(false);
  });

  it('rolls back only the pin when setAlwaysOnTop fails after compact succeeds', async () => {
    // Default-pin-on seeds compactAlwaysOnTop=true on entry; if the pin IPC
    // then fails, we want compact to stay (window is in compact mode) but
    // the pin to revert (so the store doesn't claim a pin that didn't take).
    useCompactStore.setState({ compactDefaultAlwaysOnTop: true, compactAlwaysOnTop: false });
    vi.mocked(window.electronAPI.window.setCompactMode).mockResolvedValueOnce(undefined);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockRejectedValueOnce(
      new Error('pin failed')
    );

    await useCompactStore.getState().setCompactMode(true);

    expect(useCompactStore.getState().compactMode).toBe(true);
    expect(useCompactStore.getState().compactAlwaysOnTop).toBe(false);
  });

  it('persists compact mode flag across reloads', async () => {
    await useCompactStore.getState().setCompactMode(true);
    expect(useCompactStore.getState().compactMode).toBe(true);
    expect(readPersisted().compactMode).toBe(true);
  });

  it('forwards configured compact size dimensions over IPC', async () => {
    useCompactStore.setState({ compactSize: 'lg' });
    await useCompactStore.getState().setCompactMode(true);

    expect(window.electronAPI.window.setCompactMode).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ width: 600, height: 260 })
    );
  });

  it('seeds compact always-on-top from compactDefaultAlwaysOnTop on entry', async () => {
    useCompactStore.setState({ compactDefaultAlwaysOnTop: true, compactAlwaysOnTop: false });

    await useCompactStore.getState().setCompactMode(true);

    expect(useCompactStore.getState().compactAlwaysOnTop).toBe(true);
    expect(window.electronAPI.window.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('persists compactShowFavorite toggle to localStorage', () => {
    useCompactStore.getState().setCompactShowFavorite(true);
    expect(useCompactStore.getState().compactShowFavorite).toBe(true);
    expect(readPersisted().compactShowFavorite).toBe(true);
  });

  it('persists and clamps compactAmbientIntensity within the allowed range', () => {
    useCompactStore.getState().setCompactAmbientIntensity(0.5);
    // Clamped to max (0.2).
    expect(useCompactStore.getState().compactAmbientIntensity).toBe(0.2);
    expect(readPersisted().compactAmbientIntensity).toBe(0.2);
  });

  it('resetCompactAppearance restores all compact prefs to defaults', () => {
    useCompactStore.setState({
      compactSize: 'lg',
      compactFontSize: 'sm',
      compactAmbientIntensity: 0.15,
      compactShowAlbumArt: false,
      compactShowAlbum: false,
      compactShowSeek: false,
      compactShowVolume: false,
      compactShowFavorite: true,
      compactDefaultAlwaysOnTop: true,
    });

    useCompactStore.getState().resetCompactAppearance();

    const s = useCompactStore.getState();
    expect(s.compactSize).toBe('md');
    expect(s.compactFontSize).toBe('md');
    expect(s.compactAmbientIntensity).toBe(0.08);
    expect(s.compactShowAlbumArt).toBe(true);
    expect(s.compactShowAlbum).toBe(true);
    expect(s.compactShowSeek).toBe(true);
    expect(s.compactShowVolume).toBe(true);
    expect(s.compactShowFavorite).toBe(false);
    expect(s.compactDefaultAlwaysOnTop).toBe(false);
  });

  it('rolls back compact always-on-top and localStorage when setAlwaysOnTop fails in compact mode', async () => {
    await useCompactStore.getState().setCompactMode(true);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockRejectedValueOnce(
      new Error('aot failed')
    );

    await useCompactStore.getState().setCompactAlwaysOnTop(true);

    expect(useCompactStore.getState().compactAlwaysOnTop).toBe(false);
    expect(readPersisted().compactAlwaysOnTop).toBe(false);
  });
});

// The pre-split combined `shiranami.app-store` bucket used to hold compact
// state alongside the rest of the app prefs. The new compact store imports
// that data into its own bucket once on first load so existing users
// don't lose their compact preferences.
describe('useCompactStore one-shot import from legacy app-store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('lifts persisted compact fields out of the legacy combined bucket', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: {
          compactMode: true,
          compactAlwaysOnTop: true,
          compactSize: 'lg',
          compactFontSize: 'sm',
          compactAmbientIntensity: 0.12,
          compactShowAlbumArt: false,
          compactShowFavorite: true,
        },
        version: 1,
      })
    );

    const mod = await import('./useCompactStore');
    const state = mod.useCompactStore.getState();
    expect(state.compactMode).toBe(true);
    expect(state.compactAlwaysOnTop).toBe(true);
    expect(state.compactSize).toBe('lg');
    expect(state.compactFontSize).toBe('sm');
    expect(state.compactAmbientIntensity).toBe(0.12);
    expect(state.compactShowAlbumArt).toBe(false);
    expect(state.compactShowFavorite).toBe(true);
  });

  it('coerces malformed compact values from the legacy bucket', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: {
          compactSize: 'jumbo',
          compactFontSize: 'mini',
          compactAmbientIntensity: 'broken',
        },
        version: 1,
      })
    );

    const mod = await import('./useCompactStore');
    const state = mod.useCompactStore.getState();
    expect(state.compactSize).toBe('md');
    expect(state.compactFontSize).toBe('md');
    expect(state.compactAmbientIntensity).toBe(0.08);
  });

  it('does nothing when the compact bucket already exists', async () => {
    localStorage.setItem(
      'shiranami.compact-store',
      JSON.stringify({ state: { compactSize: 'md' }, version: 1 })
    );
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({ state: { compactSize: 'lg' }, version: 1 })
    );

    const mod = await import('./useCompactStore');
    const state = mod.useCompactStore.getState();
    // Should rehydrate from the existing compact bucket, not the legacy one.
    expect(state.compactSize).toBe('md');
  });
});
