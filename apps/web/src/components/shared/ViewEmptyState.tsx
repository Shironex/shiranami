import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ViewEmptyStateAction {
  label: string;
  onClick: () => void;
}

interface ViewEmptyStateProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  hints?: { icon: LucideIcon; label: string }[];
  variant?: 'empty' | 'error';
  action?: ViewEmptyStateAction;
  /**
   * Lighter inline layout (single muted icon + title + subtitle, no mascot
   * frame or glass panel) for in-view "no matches" / "empty mix" states.
   */
  compact?: boolean;
}

export function ViewEmptyState({
  title,
  subtitle,
  icon: Icon,
  hints,
  variant = 'empty',
  action,
  compact = false,
}: ViewEmptyStateProps) {
  const isError = variant === 'error';

  if (compact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
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
    );
  }

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
        {hints && hints.length > 0 && (
          <div className="flex items-center gap-3">
            {hints.map(hint => (
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
            ))}
          </div>
        )}

        {action && (
          <Button size="sm" onClick={action.onClick} className="rounded-xl px-4 py-2">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
