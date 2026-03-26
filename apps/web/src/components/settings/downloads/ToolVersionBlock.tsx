import { useTranslation } from 'react-i18next';

type ToolVersionBlockProps = {
  installedVersion: string;
  latestVersion: string | null | undefined;
};

export function ToolVersionBlock({ installedVersion, latestVersion }: ToolVersionBlockProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">{t('dl.installedVersion')}</p>
        <p className="ml-auto text-xs text-foreground font-mono tabular-nums">{installedVersion}</p>
      </div>
      {latestVersion ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{t('dl.latestRelease')}</p>
          <p className="ml-auto text-xs text-foreground font-mono tabular-nums">{latestVersion}</p>
        </div>
      ) : null}
    </div>
  );
}
