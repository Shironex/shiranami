import { useTranslation } from 'react-i18next';
import { Check, Download } from 'lucide-react';
import type { ReactNode } from 'react';

type ToolStatusRowProps = {
  installed: boolean;
  installedTitle: string;
  notInstalledTitle: string;
  updateAvailable: boolean;
  notInstalledRight?: ReactNode;
};

export function ToolStatusRow({
  installed,
  installedTitle,
  notInstalledTitle,
  updateAvailable,
  notInstalledRight,
}: ToolStatusRowProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
      {installed ? (
        <>
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-sm text-foreground">{installedTitle}</span>
          {updateAvailable ? (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-amber-300">
              {t('dl.updateAvailable')}
            </span>
          ) : (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {t('dl.upToDate')}
            </span>
          )}
        </>
      ) : (
        <>
          <Download className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground">{notInstalledTitle}</span>
          {notInstalledRight != null ? (
            <span className="ml-auto text-[10px] text-muted-foreground/60">{notInstalledRight}</span>
          ) : null}
        </>
      )}
    </div>
  );
}
