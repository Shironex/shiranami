import { Trans } from 'react-i18next';
import { ArrowDownToLine, Check, Download } from 'lucide-react';
import { ToolStatusRow } from '@/components/settings/downloads/ToolStatusRow';
import { InstallProgressBar } from '@/components/settings/downloads/InstallProgressBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { useToolsStep } from './ToolsStep.hooks';
import type { ToolsInstallAffordance } from './ToolsStep.types';

const SKELETON_ROWS = [0, 1];

export default function ToolsStep() {
  const { t, stepContext, isDesktop, isChecking, hasMissingTools, statusRows, installAffordance } =
    useToolsStep();

  // Each render-list is built inside the branch that uses it — the two are
  // mutually exclusive, so building both unconditionally wasted a map per render.
  let body: React.ReactNode;
  if (!isDesktop) {
    body = (
      <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-sm text-muted-foreground/70">
        {t('tools.desktopOnly')}
      </p>
    );
  } else if (isChecking) {
    const skeletonRows = SKELETON_ROWS.map(i => (
      <div
        key={i}
        className="flex items-center gap-3 rounded-xl border border-border/20 bg-background/50 px-3 py-2.5"
      >
        <Download aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground/40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
    ));
    body = (
      <div className="space-y-3" role="status" aria-live="polite">
        {skeletonRows}
        <p className="text-center text-[11px] text-muted-foreground/70">{t('tools.checking')}</p>
      </div>
    );
  } else {
    const statusRowEls = statusRows.map(row => (
      <ToolStatusRow
        key={row.installedTitle}
        installed={row.installed}
        installedTitle={row.installedTitle}
        notInstalledTitle={row.notInstalledTitle}
        updateAvailable={row.updateAvailable}
        notInstalledRight={row.notInstalledRight}
      />
    ));
    body = (
      <>
        {statusRowEls}
        {hasMissingTools ? (
          <ToolsInstaller affordance={installAffordance} installLabel={t('tools.installAll')} />
        ) : (
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            <p className="text-sm leading-snug text-foreground">{t('tools.allSet')}</p>
          </div>
        )}
      </>
    );
  }

  return (
    <OnboardingStepLayout
      kanji={stepContext.kanji}
      headingId={stepContext.headingId}
      headingRef={stepContext.headingRef}
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

        {body}

        {isDesktop && (
          <p className="text-center text-[11px] text-muted-foreground/70">{t('tools.skipHint')}</p>
        )}
      </div>
    </OnboardingStepLayout>
  );
}

function ToolsInstaller({
  affordance,
  installLabel,
}: {
  affordance: ToolsInstallAffordance;
  installLabel: string;
}) {
  if (affordance.kind === 'progress') {
    return (
      <InstallProgressBar
        percent={affordance.percent}
        caption={affordance.caption}
        className="px-1"
      />
    );
  }
  return (
    <Button
      type="button"
      onClick={affordance.onInstall}
      className="w-full rounded-xl [&_svg]:size-3.5"
    >
      <ArrowDownToLine />
      {installLabel}
    </Button>
  );
}
