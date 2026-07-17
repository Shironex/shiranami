import { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING_SNAPPY } from '@/lib/motion';
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
    showReadout,
    onToggleMute,
    onVolumeChange,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
  } = useVolumeControl();

  const reducedMotion = useReducedMotion();
  const percent = Math.round(sliderValue * 100);

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
      <div
        className="relative flex items-center"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
      >
        <AnimatePresence>
          {showReadout && (
            <motion.span
              key="volume-readout"
              aria-hidden
              className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md border border-border/40 bg-popover px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-popover-foreground shadow-md"
              initial={reducedMotion ? false : { opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.9 }}
              transition={reducedMotion ? { duration: 0.1 } : SPRING_SNAPPY}
            >
              {percent}%
            </motion.span>
          )}
        </AnimatePresence>
        <Slider
          value={[sliderValue]}
          max={1}
          step={0.01}
          onValueChange={onVolumeChange}
          className={cn(sliderClassName)}
          aria-label={sliderLabel}
        />
      </div>
    </div>
  );
}

export default memo(VolumeControl);
