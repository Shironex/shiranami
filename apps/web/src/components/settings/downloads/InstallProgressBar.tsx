import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { ProgressBar } from '@/components/ui/progress-bar';

type InstallProgressBarProps = {
  percent: number;
  caption: ReactNode;
  className?: string;
};

export function InstallProgressBar({ percent, caption, className }: InstallProgressBarProps) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      <ProgressBar value={percent} />
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
