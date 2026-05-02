import type { LucideIcon } from 'lucide-react';

interface SettingsHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export function SettingsHeader({ icon: Icon, title, subtitle }: SettingsHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border/30 shrink-0">
      <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" aria-hidden="true" focusable="false" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {subtitle && (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
