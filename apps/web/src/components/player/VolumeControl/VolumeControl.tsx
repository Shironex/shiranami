import { memo } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useVolumeControl } from './VolumeControl.hooks';
import type { IVolumeControlProps } from './VolumeControl.types';

function VolumeControl({ sliderClassName = 'w-24' }: IVolumeControlProps) {
  const {
    containerRef,
    VolumeIcon,
    sliderValue,
    buttonLabel,
    buttonTooltip,
    sliderLabel,
    onToggleMute,
    onVolumeChange,
  } = useVolumeControl();

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggleMute}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={buttonLabel}
          >
            <VolumeIcon className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{buttonTooltip}</TooltipContent>
      </Tooltip>
      <Slider
        value={[sliderValue]}
        max={1}
        step={0.01}
        onValueChange={onVolumeChange}
        className={cn(sliderClassName)}
        aria-label={sliderLabel}
      />
    </div>
  );
}

export default memo(VolumeControl);
