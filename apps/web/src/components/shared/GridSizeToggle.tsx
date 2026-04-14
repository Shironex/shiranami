import { Grid2x2, LayoutGrid, Grid3x3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GridSizeToggleProps {
  size: 'small' | 'medium' | 'large';
  onSizeChange: (size: 'small' | 'medium' | 'large') => void;
  labels: {
    group: string;
    small: string;
    medium: string;
    large: string;
  };
}

export function GridSizeToggle({ size, onSizeChange, labels }: GridSizeToggleProps) {
  return (
    <div
      className="flex items-center rounded-xl border border-border/50 bg-card p-1 gap-0.5"
      role="group"
      aria-label={labels.group}
    >
      {([
        { size: 'large', icon: Grid2x2, label: labels.large },
        { size: 'medium', icon: LayoutGrid, label: labels.medium },
        { size: 'small', icon: Grid3x3, label: labels.small },
      ] as const).map(({ size: itemSize, icon: Icon, label }) => (
        <button
          key={itemSize}
          onClick={() => onSizeChange(itemSize)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            size === itemSize
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground/50 hover:text-foreground'
          )}
          aria-label={label}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
