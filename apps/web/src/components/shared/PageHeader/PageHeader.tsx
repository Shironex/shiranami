import { usePageHeader } from './PageHeader.hooks';
import type { IPageHeaderProps } from './PageHeader.types';

export default function PageHeader(props: IPageHeaderProps) {
  const { title, icon: Icon, subtitle, variant, actions } = usePageHeader(props);

  if (variant === 'section') {
    return (
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/30 shrink-0">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" aria-hidden="true" focusable="false" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif italic text-xl leading-tight text-foreground truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-6 pt-5 pb-1 shrink-0">
      <h1 className="font-serif italic text-3xl leading-tight text-foreground truncate min-w-0 flex-1">
        {title}
      </h1>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
