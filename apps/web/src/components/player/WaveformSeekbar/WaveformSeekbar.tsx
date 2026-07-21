import { cn } from '@/lib/utils';
import { useWaveformSeekbar } from './WaveformSeekbar.hooks';
import type { IWaveformSeekbarProps } from './WaveformSeekbar.types';

export default function WaveformSeekbar({ canvasClassName = 'h-7' }: IWaveformSeekbarProps = {}) {
  const {
    label,
    valueMin,
    valueMax,
    valueNow,
    valueText,
    trackRef,
    canvasRef,
    onPointerDown,
    onKeyDown,
    hoverEnabled,
    hoverLineRef,
    hoverBubbleRef,
    onPointerMove,
    onPointerLeave,
  } = useWaveformSeekbar();

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={hoverEnabled ? onPointerMove : undefined}
      onPointerLeave={hoverEnabled ? onPointerLeave : undefined}
      onKeyDown={onKeyDown}
      className="group relative flex min-w-0 flex-1 touch-none cursor-pointer select-none items-center"
      role="slider"
      aria-label={label}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      aria-valuetext={valueText}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className={cn(canvasClassName, 'w-full')} />

      {hoverEnabled && (
        <>
          {/* Faint hover playhead — a DOM line (not a canvas draw) moved via an
              inline translateX so mousemove never repaints the waveform. */}
          <div
            ref={hoverLineRef}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-px bg-foreground/30 opacity-0 transition-opacity duration-150"
          />
          {/* Hovered-timestamp bubble — positioned + labelled imperatively. */}
          <div
            ref={hoverBubbleRef}
            aria-hidden
            className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md border border-border/40 bg-popover/95 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground opacity-0 shadow-md transition-opacity duration-150"
          />
        </>
      )}
    </div>
  );
}
