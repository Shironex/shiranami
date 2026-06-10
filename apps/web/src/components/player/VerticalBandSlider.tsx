import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { EQ_MIN_DB, EQ_MAX_DB } from '@/stores/useEqStore';

const BAND_STEP = 0.5;

interface VerticalBandSliderProps {
  freq: number;
  value: number;
  onChange: (db: number) => void;
  disabled?: boolean;
  label: string;
  bandName: string;
  gainLabel: string;
  heightClass?: string;
}

/** A single graphic-EQ band: a vertical gain slider with a tooltip + frequency label. */
export function VerticalBandSlider({
  freq,
  value,
  onChange,
  disabled,
  label,
  bandName,
  gainLabel,
  heightClass = 'h-56',
}: VerticalBandSliderProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center justify-center shrink-0', heightClass)}>
            <SliderPrimitive.Root
              orientation="vertical"
              min={EQ_MIN_DB}
              max={EQ_MAX_DB}
              step={BAND_STEP}
              value={[value]}
              onValueChange={([v]) => onChange(v)}
              disabled={disabled}
              aria-label={label}
              className={cn(
                'relative flex flex-col items-center justify-center touch-none select-none h-full',
                'group cursor-pointer',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <SliderPrimitive.Track className="relative w-1 h-full grow overflow-hidden rounded-full bg-foreground/15 group-hover:w-[5px] transition-all duration-200">
                <SliderPrimitive.Range className="absolute w-full bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200" />
              </SliderPrimitive.Track>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-px w-2.5 -translate-x-1/2 -translate-y-1/2 bg-foreground/25"
              />
              <SliderPrimitive.Thumb className="block h-3 w-3 rounded-full bg-primary shadow-md shadow-primary/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none" />
            </SliderPrimitive.Root>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-center">
          <div className="font-medium">{bandName}</div>
          <div className="text-[11px] text-muted-foreground/80 tabular-nums mt-0.5">
            {gainLabel}
          </div>
        </TooltipContent>
      </Tooltip>
      <span className="text-[10px] text-muted-foreground/80 tabular-nums">
        {freq >= 1000 ? `${freq / 1000}k` : freq}
      </span>
    </div>
  );
}
