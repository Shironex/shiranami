import { create } from 'zustand';
import i18n from '@/lib/i18n';

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

const INITIAL_LABEL = () => i18n.t('installingMissingTools', { ns: 'toast' });

export const useDownloadStore = create<DownloadState & DownloadActions>((set) => ({
  isDependencyInstallInProgress: false,
  dependencyInstallProgress: 0,
  dependencyInstallLabel: INITIAL_LABEL(),
  dependencyInstallTarget: null,

  startDependencyInstall: (label = INITIAL_LABEL()) =>
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
      dependencyInstallLabel: INITIAL_LABEL(),
      dependencyInstallTarget: null,
    }),
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof useDownloadStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useDownloadStore.setState(data.store.getState());
  }
  data.store = useDownloadStore;
  hot.accept();
}
