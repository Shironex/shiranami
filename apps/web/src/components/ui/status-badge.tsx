import { type LucideIcon, Sparkles, FlaskConical, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusBadgeVariant = 'experimental' | 'beta' | 'new';

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: React.ReactNode;
  className?: string;
}

interface VariantStyle {
  icon: LucideIcon;
  classes: string;
}

const VARIANTS: Record<StatusBadgeVariant, VariantStyle> = {
  experimental: {
    icon: Sparkles,
    // Amber — caution, "may change or be removed"
    classes:
      'bg-amber-500/10 border-amber-400/25 text-amber-300 shadow-[inset_0_1px_0_rgba(252,211,77,0.12)]',
  },
  beta: {
    icon: FlaskConical,
    // Primary purple — "feature-complete, stabilizing"
    classes:
      'bg-primary/10 border-primary/30 text-primary shadow-[inset_0_1px_0_rgba(167,139,250,0.15)]',
  },
  new: {
    icon: Zap,
    // Emerald — "shipped recently, check it out"
    classes:
      'bg-emerald-500/10 border-emerald-400/25 text-emerald-300 shadow-[inset_0_1px_0_rgba(110,231,183,0.12)]',
  },
};

/**
 * Small pill badge for marking feature stability (experimental, beta, new).
 * Uses a layered translucent style with a subtle border, inset highlight,
 * and a tiny semantic icon to feel polished rather than generic.
 */
export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  const { icon: Icon, classes } = VARIANTS[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 shrink-0',
        'px-1.5 py-0.5 rounded-full border',
        'text-[10px] font-semibold uppercase tracking-[0.08em] leading-none',
        'backdrop-blur-sm',
        classes,
        className,
      )}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2.5} />
      {children}
    </span>
  );
}
