import { cn } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useInstallProgressBar } from './InstallProgressBar.hooks';
import type { IInstallProgressBarProps } from './InstallProgressBar.types';

export default function InstallProgressBar(props: IInstallProgressBarProps) {
  const { percent, caption, className } = useInstallProgressBar(props);

  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      <ProgressBar value={percent} />
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
