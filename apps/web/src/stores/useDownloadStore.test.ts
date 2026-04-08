import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({
  default: {
    t: (key: string) => key,
  },
}));

import { useDownloadStore } from './useDownloadStore';

function resetStore() {
  useDownloadStore.setState({
    isDependencyInstallInProgress: false,
    dependencyInstallProgress: 0,
    dependencyInstallLabel: 'installingMissingTools',
    dependencyInstallTarget: null,
  });
}

describe('useDownloadStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // --- initial state ---
  describe('initial state', () => {
    it('has isDependencyInstallInProgress set to false', () => {
      expect(useDownloadStore.getState().isDependencyInstallInProgress).toBe(false);
    });

    it('has progress at 0', () => {
      expect(useDownloadStore.getState().dependencyInstallProgress).toBe(0);
    });

    it('has default label from i18n', () => {
      expect(useDownloadStore.getState().dependencyInstallLabel).toBe('installingMissingTools');
    });

    it('has null target', () => {
      expect(useDownloadStore.getState().dependencyInstallTarget).toBeNull();
    });
  });

  // --- startDependencyInstall ---
  describe('startDependencyInstall', () => {
    it('sets isDependencyInstallInProgress to true and resets progress/target', () => {
      useDownloadStore.getState().startDependencyInstall();
      const s = useDownloadStore.getState();
      expect(s.isDependencyInstallInProgress).toBe(true);
      expect(s.dependencyInstallProgress).toBe(0);
      expect(s.dependencyInstallTarget).toBeNull();
    });

    it('uses default label when no argument is provided', () => {
      useDownloadStore.getState().startDependencyInstall();
      expect(useDownloadStore.getState().dependencyInstallLabel).toBe('installingMissingTools');
    });

    it('accepts a custom label', () => {
      useDownloadStore.getState().startDependencyInstall('Custom label');
      expect(useDownloadStore.getState().dependencyInstallLabel).toBe('Custom label');
    });
  });

  // --- updateDependencyInstall ---
  describe('updateDependencyInstall', () => {
    it('updates all fields from progress object', () => {
      useDownloadStore.getState().updateDependencyInstall({
        target: 'ytdlp',
        percent: 50,
        overallPercent: 25,
        label: 'Downloading yt-dlp...',
      });
      const s = useDownloadStore.getState();
      expect(s.isDependencyInstallInProgress).toBe(true);
      expect(s.dependencyInstallProgress).toBe(25);
      expect(s.dependencyInstallLabel).toBe('Downloading yt-dlp...');
      expect(s.dependencyInstallTarget).toBe('ytdlp');
    });

    it('updates with ffmpeg target', () => {
      useDownloadStore.getState().updateDependencyInstall({
        target: 'ffmpeg',
        percent: 80,
        overallPercent: 90,
        label: 'Installing ffmpeg...',
      });
      const s = useDownloadStore.getState();
      expect(s.dependencyInstallTarget).toBe('ffmpeg');
      expect(s.dependencyInstallProgress).toBe(90);
    });
  });

  // --- stopDependencyInstall ---
  describe('stopDependencyInstall', () => {
    it('resets all state back to initial values', () => {
      // First start and update to have non-initial state
      useDownloadStore.getState().startDependencyInstall('Working...');
      useDownloadStore.getState().updateDependencyInstall({
        target: 'ytdlp',
        percent: 75,
        overallPercent: 50,
        label: 'Halfway there',
      });

      useDownloadStore.getState().stopDependencyInstall();
      const s = useDownloadStore.getState();
      expect(s.isDependencyInstallInProgress).toBe(false);
      expect(s.dependencyInstallProgress).toBe(0);
      expect(s.dependencyInstallLabel).toBe('installingMissingTools');
      expect(s.dependencyInstallTarget).toBeNull();
    });
  });
});
