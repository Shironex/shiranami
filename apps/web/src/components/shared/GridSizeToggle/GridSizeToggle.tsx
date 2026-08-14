import { cn } from '@/lib/utils';
import { useGridSizeToggle } from './GridSizeToggle.hooks';
import type { IGridSizeToggleProps } from './GridSizeToggle.types';

export default function GridSizeToggle(props: IGridSizeToggleProps) {
  const { onSizeChange, labels } = props;
  const { options } = useGridSizeToggle(props);

  const buttons = options.map(({ size: itemSize, icon: Icon, label, active }) => (
    <button
      key={itemSize}
      onClick={() => onSizeChange(itemSize)}
      className={cn(
        'focus-ring p-2 rounded-lg transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  ));

  return (
    <div
      className="flex items-center rounded-xl border border-border/50 bg-card p-1 gap-0.5"
      role="group"
      aria-label={labels.group}
    >
      {buttons}
    </div>
  );
}
