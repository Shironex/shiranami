import { cn } from '@/lib/utils';
import { useEqBars } from './EqBars.hooks';
import type { IEqBarsProps } from './EqBars.types';

/**
 * The three animated equalizer bars used as the now-playing indicator on track
 * rows. Decorative (`aria-hidden`) — the accessible "now playing" label is
 * supplied by the caller.
 */
export default function EqBars(props: IEqBarsProps) {
  const { sm } = useEqBars(props);
  const barClassName = cn(
    'rounded-full bg-primary origin-bottom',
    sm ? 'w-[2px]' : 'w-[3px]',
    'h-full'
  );

  return (
    <div
      className={cn('flex items-end', sm ? 'gap-[2px] h-3' : 'gap-[3px] h-4', props.className)}
      aria-hidden="true"
    >
      <div className={cn(barClassName, 'eq-bar-1')} />
      <div className={cn(barClassName, 'eq-bar-2')} />
      <div className={cn(barClassName, 'eq-bar-3')} />
    </div>
  );
}
