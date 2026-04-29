import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AlbumSortMode } from '@/stores/useAppStore';

export interface AlbumSortControlProps {
  mode: AlbumSortMode;
  order: 'asc' | 'desc';
  onModeChange: (mode: AlbumSortMode) => void;
  onOrderChange: (order: 'asc' | 'desc') => void;
  labels: {
    button: string;
    modeName: string;
    modeArtist: string;
    modeYear: string;
    modeRecentlyAdded: string;
    orderAsc: string;
    orderDesc: string;
  };
}

function modeLabel(mode: AlbumSortMode, labels: AlbumSortControlProps['labels']): string {
  switch (mode) {
    case 'artist':
      return labels.modeArtist;
    case 'year':
      return labels.modeYear;
    case 'recentlyAdded':
      return labels.modeRecentlyAdded;
    case 'name':
    default:
      return labels.modeName;
  }
}

export function AlbumSortControl({
  mode,
  order,
  onModeChange,
  onOrderChange,
  labels,
}: AlbumSortControlProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label={labels.button}
          title={labels.button}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span className="hidden sm:inline">{modeLabel(mode, labels)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52">
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 px-1">
            {labels.button}
          </p>
          <div className="flex flex-col gap-0.5">
            {(['name', 'artist', 'year', 'recentlyAdded'] as const).map(m => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={cn(
                  'text-left px-2 py-1.5 rounded-md text-xs transition-colors',
                  mode === m ? 'bg-primary/15 text-primary' : 'text-foreground/80 hover:bg-accent'
                )}
              >
                {modeLabel(m, labels)}
              </button>
            ))}
          </div>
          <div className="h-px bg-border/40 my-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => onOrderChange('asc')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors',
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
                'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors',
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
