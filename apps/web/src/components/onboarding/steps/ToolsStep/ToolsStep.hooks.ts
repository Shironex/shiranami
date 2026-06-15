import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useDownloadsSettings } from '@/components/settings/downloads/useDownloadsSettings';
import { useOnboardingStepContext } from '../../stepContext';
import type { IToolsStepView, IToolStatusRowData, ToolsInstallAffordance } from './ToolsStep.types';

/**
 * Wraps the existing `useDownloadsSettings` hook and reuses the settings
 * download primitives verbatim — no new install logic. Installs never gate
 * `goNext`; the step is fully skippable.
 *
 * The "Install both" overall-progress event (`onDependencyInstallProgress`) is
 * normally subscribed in `App.tsx`, which is NOT mounted during onboarding, so
 * we register the same subscription locally (idempotent — App re-subscribes once
 * mounted post-finish) to keep the dependency-install bar animating.
 */
export function useToolsStep(): IToolsStepView {
  const { t } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();
  const updateDependencyInstall = useDownloadStore(s => s.updateDependencyInstall);
  const s = useDownloadsSettings();

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onDependencyInstallProgress(progress => {
      updateDependencyInstall(progress);
    });
    return cleanup;
  }, [updateDependencyInstall]);

  const statusRows: IToolStatusRowData[] = [
    {
      installed: Boolean(s.ytdlpInstalled),
      installedTitle: t('dl.ytdlpInstalled', { ns: 'settings' }),
      notInstalledTitle: t('dl.ytdlpNotInstalled', { ns: 'settings' }),
      updateAvailable: s.ytdlpUpdateAvailable,
    },
    {
      installed: Boolean(s.ffmpegInstalled),
      installedTitle: t('dl.ffmpegInstalled', { ns: 'settings' }),
      notInstalledTitle: t('dl.ffmpegNotInstalled', { ns: 'settings' }),
      updateAvailable: s.ffmpegUpdateAvailable,
      notInstalledRight: t('dl.recommended', { ns: 'settings' }),
    },
  ];

  const installAffordance = resolveInstallAffordance(s, t);

  return {
    t,
    stepContext,
    isDesktop: IS_ELECTRON,
    isChecking: s.isCheckingDownloadTools,
    hasMissingTools: s.hasMissingDownloadTools,
    statusRows,
    installAffordance,
  };
}

/**
 * Picks the install affordance. Prefers the one-pass "Install both" path (with
 * its overall-progress bar) and falls back to per-tool bars whenever a single
 * tool install is streaming progress; otherwise shows the install button.
 */
function resolveInstallAffordance(
  s: ReturnType<typeof useDownloadsSettings>,
  t: IToolsStepView['t']
): ToolsInstallAffordance {
  if (s.dependenciesInstalling) {
    return {
      kind: 'progress',
      percent: s.dependencyInstallProgress,
      caption: `${s.dependencyInstallLabel}… ${s.dependencyInstallProgress}%`,
    };
  }
  if (s.ytdlpInstalling) {
    return {
      kind: 'progress',
      percent: s.ytdlpInstallProgress,
      caption: `${t('dl.downloadingYtdlp', { ns: 'settings' })} ${s.ytdlpInstallProgress}%`,
    };
  }
  if (s.ffmpegInstalling) {
    return {
      kind: 'progress',
      percent: s.ffmpegInstallProgress,
      caption: `${t('dl.downloadingFfmpeg', { ns: 'settings' })} ${s.ffmpegInstallProgress}%`,
    };
  }
  return { kind: 'button', onInstall: s.handleInstallMissingTools };
}
