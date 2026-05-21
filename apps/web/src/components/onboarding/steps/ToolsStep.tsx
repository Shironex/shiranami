import { useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { ArrowDownToLine, Check, Download } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useDownloadsSettings } from '@/components/settings/downloads/useDownloadsSettings';
import { ToolStatusRow } from '@/components/settings/downloads/ToolStatusRow';
import { InstallProgressBar } from '@/components/settings/downloads/InstallProgressBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

/**
 * Step 02 · Tools. Optional first-run installer for yt-dlp + ffmpeg so a user
 * can download and import straight away. Wraps the existing `useDownloadsSettings`
 * hook and reuses the settings download primitives verbatim — no new install
 * logic. Installs never gate `goNext`; the step is fully skippable.
 *
 * The "Install both" overall-progress event (`onDependencyInstallProgress`) is
 * normally subscribed in `App.tsx`, which is NOT mounted during onboarding, so
 * we register the same subscription locally (idempotent — App re-subscribes once
 * mounted post-finish) to keep the dependency-install bar animating.
 */
export function ToolsStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();
  const updateDependencyInstall = useDownloadStore(s => s.updateDependencyInstall);
  const s = useDownloadsSettings();

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onDependencyInstallProgress(progress => {
      updateDependencyInstall(progress);
    });
    return cleanup;
  }, [updateDependencyInstall]);

  return (
    <OnboardingStepLayout
      kanji={kanji}
      headingId={headingId}
      headingRef={headingRef}
      stepMarker={t('tools.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="tools.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('tools.description')}
    >
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">{t('tools.title')}</p>

        {!IS_ELECTRON ? (
          <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-sm text-muted-foreground/70">
            {t('tools.desktopOnly')}
          </p>
        ) : s.isCheckingDownloadTools ? (
          <ToolsCheckingSkeleton label={t('tools.checking')} />
        ) : (
          <>
            <ToolStatusRow
              installed={Boolean(s.ytdlpInstalled)}
              installedTitle={t('dl.ytdlpInstalled', { ns: 'settings' })}
              notInstalledTitle={t('dl.ytdlpNotInstalled', { ns: 'settings' })}
              updateAvailable={s.ytdlpUpdateAvailable}
            />
            <ToolStatusRow
              installed={Boolean(s.ffmpegInstalled)}
              installedTitle={t('dl.ffmpegInstalled', { ns: 'settings' })}
              notInstalledTitle={t('dl.ffmpegNotInstalled', { ns: 'settings' })}
              updateAvailable={s.ffmpegUpdateAvailable}
              notInstalledRight={t('dl.recommended', { ns: 'settings' })}
            />

            {s.hasMissingDownloadTools ? (
              <ToolsInstaller s={s} />
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                <p className="text-sm leading-snug text-foreground">{t('tools.allSet')}</p>
              </div>
            )}
          </>
        )}

        {IS_ELECTRON && (
          <p className="text-center text-[11px] text-muted-foreground/70">{t('tools.skipHint')}</p>
        )}
      </div>
    </OnboardingStepLayout>
  );
}

/**
 * The install affordance once we know a tool is missing. Prefers the one-pass
 * "Install both" path (with its overall-progress bar) and falls back to per-tool
 * bars whenever a single tool install is streaming progress.
 */
function ToolsInstaller({ s }: { s: ReturnType<typeof useDownloadsSettings> }) {
  const { t } = useTranslation('onboarding');

  if (s.dependenciesInstalling) {
    return (
      <InstallProgressBar
        percent={s.dependencyInstallProgress}
        caption={`${s.dependencyInstallLabel}… ${s.dependencyInstallProgress}%`}
        className="px-1"
      />
    );
  }

  if (s.ytdlpInstalling) {
    return (
      <InstallProgressBar
        percent={s.ytdlpInstallProgress}
        caption={`${t('dl.downloadingYtdlp', { ns: 'settings' })} ${s.ytdlpInstallProgress}%`}
        className="px-1"
      />
    );
  }

  if (s.ffmpegInstalling) {
    return (
      <InstallProgressBar
        percent={s.ffmpegInstallProgress}
        caption={`${t('dl.downloadingFfmpeg', { ns: 'settings' })} ${s.ffmpegInstallProgress}%`}
        className="px-1"
      />
    );
  }

  return (
    <Button
      type="button"
      onClick={s.handleInstallMissingTools}
      className="w-full rounded-xl [&_svg]:size-3.5"
    >
      <ArrowDownToLine />
      {t('tools.installAll')}
    </Button>
  );
}

function ToolsCheckingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {[0, 1].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border/20 bg-background/50 px-3 py-2.5"
        >
          <Download className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
      <p className="text-center text-[11px] text-muted-foreground/70">{label}</p>
    </div>
  );
}
