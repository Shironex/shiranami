import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ISummaryRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  /** Tints the value with the accent color (e.g. an enabled integration). */
  readonly highlight?: boolean;
}

/**
 * Single read-only recap row for the onboarding Summary step (icon · label ·
 * value). Local to onboarding — single-use, so it lives beside SummaryStep
 * rather than in components/shared. Static: no effects, no rAF.
 */
export function SummaryRow({ icon, label, value, highlight }: ISummaryRowProps) {
  return (
    <div
      role="listitem"
      className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-foreground/[0.02] px-3 py-2.5 text-xs"
    >
      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <span aria-hidden="true" className="text-primary [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em]',
          highlight ? 'text-primary' : 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}
