import { Check, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SearchStateCard } from '../SearchStateCard';
import { useDependencyInstallCard } from './DependencyInstallCard.hooks';
import type { IDependencyInstallCardProps } from './DependencyInstallCard.types';

export default function DependencyInstallCard(props: IDependencyInstallCardProps) {
  const { installProgress, installError, onInstall } = props;
  const {
    title,
    description,
    showProgress,
    showSuccess,
    showInstallButton,
    progressCaption,
    installedLabel,
    installButtonLabel,
    showError,
  } = useDependencyInstallCard(props);

  return (
    <SearchStateCard title={title} description={description}>
      <div className="space-y-3">
        {showProgress && (
          <div className="space-y-3">
            <ProgressBar value={installProgress} />
            <p className="text-xs text-muted-foreground">{progressCaption}</p>
          </div>
        )}

        {showSuccess && (
          <div className="flex items-center justify-center gap-2 text-success">
            <Check className="w-4 h-4" />
            <p className="text-sm font-medium">{installedLabel}</p>
          </div>
        )}

        {showInstallButton && (
          <>
            <Button onClick={onInstall} className="h-auto w-full rounded-xl py-2.5">
              <ArrowDownToLine />
              {installButtonLabel}
            </Button>
            {showError && <p className="text-xs text-destructive">{installError}</p>}
          </>
        )}
      </div>
    </SearchStateCard>
  );
}
