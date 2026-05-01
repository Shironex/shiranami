import { useTranslation } from 'react-i18next';
import { Check, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchStateCard } from './SearchStateCard';

interface DependencyInstallCardProps {
  ffmpegInstalled: boolean | undefined;
  installStatus: 'idle' | 'downloading' | 'done' | 'error';
  installError: string | null;
  isInstallInProgress: boolean;
  installProgress: number;
  installLabel: string;
  onInstall: () => void;
}

export function DependencyInstallCard({
  ffmpegInstalled,
  installStatus,
  installError,
  isInstallInProgress,
  installProgress,
  installLabel,
  onInstall,
}: DependencyInstallCardProps) {
  const { t } = useTranslation('search');
  const description =
    ffmpegInstalled === false ? t('toolsMissingDescBoth') : t('toolsMissingDescYtdlp');

  return (
    <SearchStateCard title={t('toolsMissing')} description={description}>
      <div className="space-y-3">
        {installStatus === 'downloading' || isInstallInProgress ? (
          <div className="space-y-3">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${installProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {installLabel}... {installProgress}%
            </p>
          </div>
        ) : installStatus === 'done' ? (
          <div className="flex items-center justify-center gap-2 text-green-400">
            <Check className="w-4 h-4" />
            <p className="text-sm font-medium">{t('toolsInstalled')}</p>
          </div>
        ) : (
          <>
            <Button onClick={onInstall} className="h-auto w-full rounded-xl py-2.5">
              <ArrowDownToLine />
              {t('installMissingTools')}
            </Button>
            {installStatus === 'error' && installError && (
              <p className="text-xs text-destructive">{installError}</p>
            )}
          </>
        )}
      </div>
    </SearchStateCard>
  );
}
