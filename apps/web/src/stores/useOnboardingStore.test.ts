import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from './useOnboardingStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

const STORE_KEY = 'shiranami.onboarding';
const ELECTRON_KEY = 'app.onboardingCompleted';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe('useOnboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingStore.setState({ hasCompletedOnboarding: false });
    vi.mocked(window.electronAPI.store.set).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.store.delete).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.store.get).mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it('defaults to not completed on a fresh install', () => {
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(false);
  });

  it('completeOnboarding flips the flag, persists it, and mirrors to electron-store', () => {
    useOnboardingStore.getState().completeOnboarding();

    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
    expect(readPersisted().hasCompletedOnboarding).toBe(true);
    expect(window.electronAPI.store.set).toHaveBeenCalledWith(ELECTRON_KEY, true);
  });

  it('resetOnboarding clears the flag and deletes the electron-store mirror', () => {
    useOnboardingStore.getState().completeOnboarding();
    vi.clearAllMocks();

    useOnboardingStore.getState().resetOnboarding();

    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(false);
    expect(readPersisted().hasCompletedOnboarding).toBe(false);
    expect(window.electronAPI.store.delete).toHaveBeenCalledWith(ELECTRON_KEY);
  });

  it('hydrateOnboarding marks completed when the electron-store mirror is true', async () => {
    vi.mocked(window.electronAPI.store.get).mockResolvedValueOnce(true);

    await useOnboardingStore.getState().hydrateOnboarding();

    expect(window.electronAPI.store.get).toHaveBeenCalledWith(ELECTRON_KEY);
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });

  it('hydrateOnboarding leaves the flag untouched when the mirror is absent', async () => {
    vi.mocked(window.electronAPI.store.get).mockResolvedValueOnce(undefined);

    await useOnboardingStore.getState().hydrateOnboarding();

    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(false);
  });

  it('hydrateOnboarding swallows electron-store read failures', async () => {
    vi.mocked(window.electronAPI.store.get).mockRejectedValueOnce(new Error('ipc failed'));

    await expect(useOnboardingStore.getState().hydrateOnboarding()).resolves.toBeUndefined();
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(false);
  });

  it('coerces a malformed persisted value to false on merge', () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { hasCompletedOnboarding: 'yes' }, version: 1 })
    );

    const merged = useOnboardingStore.persist
      .getOptions()
      .merge?.(
        { hasCompletedOnboarding: 'yes' },
        useOnboardingStore.getState()
      ) as OnboardingMergeResult;

    expect(merged.hasCompletedOnboarding).toBe(false);
  });
});

interface OnboardingMergeResult {
  hasCompletedOnboarding: boolean;
}
