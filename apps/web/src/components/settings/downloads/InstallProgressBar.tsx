import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type InstallProgressBarProps = {
  percent: number;
  caption: ReactNode;
  className?: string;
};

export function InstallProgressBar({ percent, caption, className }: InstallProgressBarProps) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
