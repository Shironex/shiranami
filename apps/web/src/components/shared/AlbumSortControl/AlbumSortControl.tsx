import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAlbumSortControl } from './AlbumSortControl.hooks';
import type { IAlbumSortControlProps } from './AlbumSortControl.types';

export default function AlbumSortControl(props: IAlbumSortControlProps) {
  const { order, onModeChange, onOrderChange, labels } = props;
  const { currentModeLabel, modeOptions } = useAlbumSortControl(props);

  const modeButtons = modeOptions.map(option => (
    <button
      key={option.mode}
      onClick={() => onModeChange(option.mode)}
      className={cn(
        'focus-ring text-left px-2 py-1.5 rounded-md text-xs transition-colors',
        option.active ? 'bg-primary/15 text-primary' : 'text-foreground/80 hover:bg-accent'
      )}
    >
      {option.label}
    </button>
  ));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="focus-ring flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label={labels.button}
          title={labels.button}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span className="hidden sm:inline">{currentModeLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52">
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 px-1">
            {labels.button}
          </p>
          <div className="flex flex-col gap-0.5">{modeButtons}</div>
          <div className="h-px bg-border/40 my-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => onOrderChange('asc')}
              className={cn(
                'focus-ring flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors',
                order === 'asc'
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground/80 hover:bg-accent'
              )}
              aria-label={labels.orderAsc}
              title={labels.orderAsc}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>{labels.orderAsc}</span>
            </button>
            <button
              onClick={() => onOrderChange('desc')}
              className={cn(
                'focus-ring flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors',
                order === 'desc'
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground/80 hover:bg-accent'
              )}
              aria-label={labels.orderDesc}
              title={labels.orderDesc}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>{labels.orderDesc}</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
