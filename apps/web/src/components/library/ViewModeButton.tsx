import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ViewModeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}

export function ViewModeButton({ active, onClick, icon: Icon, label }: ViewModeButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'p-2 rounded-lg transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
