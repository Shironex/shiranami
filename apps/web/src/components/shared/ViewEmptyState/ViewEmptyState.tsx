import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useViewEmptyState } from './ViewEmptyState.hooks';
import type { IViewEmptyStateProps } from './ViewEmptyState.types';

export default function ViewEmptyState(props: IViewEmptyStateProps) {
  const { title, subtitle, icon: Icon, hints, action, compact, isError } = useViewEmptyState(props);

  if (compact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center glass-subtle rounded-2xl border border-border/30 px-8 py-7">
          <Icon className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base font-medium text-foreground/85">{title}</p>
            <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto leading-relaxed">
              {subtitle}
            </p>
          </div>
          {action && (
            <Button size="sm" onClick={action.onClick} className="rounded-xl px-4 py-2">
              {action.label}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const hasHints = !!hints && hints.length > 0;
  const hintChips = hints?.map(hint => (
    <div
      key={hint.label}
      className={cn(
        'flex items-center gap-2 px-3.5 py-2 rounded-xl',
        'bg-muted/40 border border-border/20',
        'text-xs text-muted-foreground/60'
      )}
    >
      <hint.icon className="w-3.5 h-3.5 shrink-0" />
      <span>{hint.label}</span>
    </div>
  ));

  return (
    <div className="flex-1 min-h-full flex items-center justify-center">
      <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center glass-subtle rounded-[28px] border border-border/30">
        {/* Mascot + contextual badge */}
        <div className="relative">
          <div
            className={cn(
              'w-28 h-28 rounded-[28px] border flex items-center justify-center',
              isError ? 'bg-destructive/8 border-destructive/10' : 'bg-primary/8 border-primary/10'
            )}
          >
            <img
              src="./mascot.png"
              alt=""
              aria-hidden="true"
              className={cn(
                'w-[4.5rem] h-[4.5rem] object-contain',
                isError ? 'opacity-50' : 'opacity-70 float-mascot'
              )}
              draggable={false}
            />
          </div>
          <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
            <Icon className={cn('w-4 h-4', isError ? 'text-destructive' : 'text-primary')} />
          </div>
        </div>

        {/* Text */}
        <div>
          <p className="font-display text-base font-semibold text-foreground/85">{title}</p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Contextual hints */}
        {hasHints && <div className="flex items-center gap-3">{hintChips}</div>}

        {action && (
          <Button size="sm" onClick={action.onClick} className="rounded-xl px-4 py-2">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
