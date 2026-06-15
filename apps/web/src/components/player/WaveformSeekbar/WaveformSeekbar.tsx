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
  } = useWaveformSeekbar();

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
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
    </div>
  );
}
