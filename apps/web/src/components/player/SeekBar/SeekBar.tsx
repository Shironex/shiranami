import { useSeekBar } from './SeekBar.hooks';

export default function SeekBar() {
  const {
    label,
    valueMin,
    valueMax,
    valueNow,
    valueText,
    trackRef,
    fillRef,
    thumbRef,
    onPointerDown,
    onKeyDown,
  } = useSeekBar();

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="group relative flex min-w-0 flex-1 touch-none cursor-pointer select-none items-center py-1"
      role="slider"
      aria-label={label}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      aria-valuetext={valueText}
      tabIndex={0}
    >
      {/* Track */}
      <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-foreground/[0.06] group-hover:h-[5px] transition-all duration-200">
        {/* Range fill — full width, scaled along X (compositor-only). */}
        <div
          ref={fillRef}
          className="absolute h-full w-full origin-left bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200 group-hover:shadow-[0_0_8px_0_rgba(var(--primary-rgb),0.5)]"
        />
      </div>
      {/* Thumb — positioned via translateX (compositor-only). */}
      <div
        ref={thumbRef}
        className="absolute left-0 h-0 w-0 rounded-full bg-primary shadow-[0_0_10px_0_rgba(var(--primary-rgb),0.6)] transition-[width,height,background-color,box-shadow] duration-200 group-hover:h-3 group-hover:w-3"
      />
    </div>
  );
}
