import { create } from 'zustand';

type DependencyInstallTarget = 'ytdlp' | 'ffmpeg' | null;

interface DependencyInstallProgress {
  target: 'ytdlp' | 'ffmpeg';
  percent: number;
  overallPercent: number;
  label: string;
}

interface DownloadState {
  isDependencyInstallInProgress: boolean;
  dependencyInstallProgress: number;
  dependencyInstallLabel: string;
  dependencyInstallTarget: DependencyInstallTarget;
}

interface DownloadActions {
  startDependencyInstall: (label?: string) => void;
  updateDependencyInstall: (progress: DependencyInstallProgress) => void;
  stopDependencyInstall: () => void;
}

const INITIAL_LABEL = 'Installing missing tools';

export const useDownloadStore = create<DownloadState & DownloadActions>((set) => ({
  isDependencyInstallInProgress: false,
  dependencyInstallProgress: 0,
  dependencyInstallLabel: INITIAL_LABEL,
  dependencyInstallTarget: null,

  startDependencyInstall: (label = INITIAL_LABEL) =>
    set({
      isDependencyInstallInProgress: true,
      dependencyInstallProgress: 0,
      dependencyInstallLabel: label,
      dependencyInstallTarget: null,
    }),

  updateDependencyInstall: (progress) =>
    set({
      isDependencyInstallInProgress: true,
      dependencyInstallProgress: progress.overallPercent,
      dependencyInstallLabel: progress.label,
      dependencyInstallTarget: progress.target,
    }),

  stopDependencyInstall: () =>
    set({
      isDependencyInstallInProgress: false,
      dependencyInstallProgress: 0,
      dependencyInstallLabel: INITIAL_LABEL,
      dependencyInstallTarget: null,
    }),
}));

if (import.meta.hot) {
  if (import.meta.hot.data.store) {
    useDownloadStore.setState(import.meta.hot.data.store.getState());
  }
  import.meta.hot.data.store = useDownloadStore;
  import.meta.hot.accept();
}
