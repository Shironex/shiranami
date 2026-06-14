import { cn } from '@/lib/utils';
import type { IViewModeButtonProps, IViewModeButtonView } from './ViewModeButton.types';

export function useViewModeButton({ active }: IViewModeButtonProps): IViewModeButtonView {
  return {
    className: cn(
      'p-2 rounded-lg transition-colors',
      active ? 'bg-primary/15 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
    ),
  };
}
