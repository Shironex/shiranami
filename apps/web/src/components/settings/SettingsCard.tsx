import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsCardProps {
  children?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  title?: string;
  subtitle?: string;
}

export function SettingsCard({ children, className, icon: Icon, title, subtitle }: SettingsCardProps) {
  return (
    <div className={cn('bg-surface/50 border border-border/30 rounded-2xl p-5', children && 'space-y-4', className)}>
      {Icon && title && (
        <div className={cn('flex items-center gap-2.5', children && 'mb-3')}>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground/70">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
