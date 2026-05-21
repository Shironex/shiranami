import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  variant?: 'page' | 'section';
}

export function PageHeader({ title, icon: Icon, subtitle, variant = 'page' }: PageHeaderProps) {
  if (variant === 'section') {
    return (
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/30 shrink-0">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" aria-hidden="true" focusable="false" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="font-serif italic text-xl leading-tight text-foreground truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-5 pb-1 shrink-0">
      <h1 className="font-serif italic text-3xl leading-tight text-foreground truncate">{title}</h1>
    </div>
  );
}
