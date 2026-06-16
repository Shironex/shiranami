import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStatusCard } from './StatusCard.hooks';
import type { IStatusCardProps } from './StatusCard.types';

/**
 * Centered mascot status card with an optional icon badge and a destructive
 * variant — the shared shape behind SearchStateCard and the inline
 * searching/error cards in SearchView + RadioView. Promoted from
 * search/SearchStateCard so those inline blocks can collapse onto it.
 */
export default function StatusCard(props: IStatusCardProps) {
  const {
    title,
    description,
    badgeIcon: BadgeIcon,
    loading,
    children,
    isError,
    showBadge,
  } = useStatusCard(props);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-border/30 glass-subtle px-8 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div
          className={cn(
            'mx-auto relative w-24 h-24 rounded-[28px] border flex items-center justify-center',
            isError ? 'bg-destructive/8 border-destructive/10' : 'bg-primary/8 border-primary/10'
          )}
        >
          <img
            src="./mascot.png"
            alt=""
            aria-hidden="true"
            className="w-16 h-16 object-contain opacity-80"
            draggable={false}
          />
          {showBadge && (
            <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
              {loading ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                BadgeIcon && (
                  <BadgeIcon
                    className={cn('w-4 h-4', isError ? 'text-destructive' : 'text-primary')}
                  />
                )
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="font-display text-lg font-semibold text-foreground">{title}</p>
          {description && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>

        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
