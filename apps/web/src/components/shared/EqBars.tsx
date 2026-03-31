import { cn } from '@/lib/utils';

interface EqBarsProps {
  size?: 'sm' | 'default';
  className?: string;
}

export function EqBars({ size = 'default', className }: EqBarsProps) {
  const sm = size === 'sm';
  return (
    <div
      className={cn(
        'flex items-end',
        sm ? 'gap-[2px] h-3' : 'gap-[3px] h-4',
        className
      )}
      aria-hidden="true"
    >
      <div className={cn('rounded-full bg-primary origin-bottom eq-bar-1', sm ? 'w-[2px]' : 'w-[3px]', 'h-full')} />
      <div className={cn('rounded-full bg-primary origin-bottom eq-bar-2', sm ? 'w-[2px]' : 'w-[3px]', 'h-full')} />
      <div className={cn('rounded-full bg-primary origin-bottom eq-bar-3', sm ? 'w-[2px]' : 'w-[3px]', 'h-full')} />
    </div>
  );
}
