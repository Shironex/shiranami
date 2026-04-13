import type { LucideIcon } from 'lucide-react';
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
}

export function ViewEmptyState({
  title,
  subtitle,
  icon: Icon,
  hints,
  variant = 'empty',
  action,
}: ViewEmptyStateProps) {
  const isError = variant === 'error';
  return (
    <div className="flex-1 min-h-full flex items-center justify-center">
      <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center">
        {/* Mascot + contextual badge */}
        <div className="relative">
          <div
            className={cn(
              'w-28 h-28 rounded-[28px] border flex items-center justify-center',
              isError
                ? 'bg-destructive/8 border-destructive/10'
                : 'bg-primary/8 border-primary/10'
            )}
          >
            <img
              src="./mascot.png"
              alt=""
              aria-hidden="true"
              className={cn(
                'w-[4.5rem] h-[4.5rem] object-contain',
                isError
                  ? 'opacity-50'
                  : 'opacity-70 animate-[splash-float_6s_ease-in-out_infinite]'
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
          <p className="font-display text-base font-semibold text-foreground/85">
            {title}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Contextual hints */}
        {hints && hints.length > 0 && (
          <div className="flex items-center gap-3">
            {hints.map((hint) => (
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
          <button
            onClick={action.onClick}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
