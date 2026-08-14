import { Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Companion } from '@/components/companion/Companion';
import { useCompanionPerch } from './CompanionPerch.hooks';

/**
 * The primary perch: the resident sits on the PlayerBar's top edge, feet
 * overlapping the border — the waveform is the water, this is the shoreline.
 * Draggable along the top edge only (x-constrained, seat persisted); the
 * volume/queue cluster keeps right-of-way via the CSS clamp.
 *
 * Hitbox discipline: the wrapper is `aria-hidden` + `pointer-events-none`;
 * only the small body hitbox accepts the pointer, so the perch can never
 * fight the player controls.
 */
export default function CompanionPerch() {
  const {
    visible,
    presence,
    wrapStyle,
    hiding,
    dragging,
    peekOffset,
    faceOverride,
    wrapRef,
    spriteRef,
    noteRef,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  } = useCompanionPerch();

  if (!visible) return null;

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      data-slot="companion-perch"
      className={cn(
        'absolute z-0 select-none pointer-events-none',
        'transition-[transform,opacity] duration-300 ease-in',
        hiding && 'translate-y-[46px] opacity-0'
      )}
      style={wrapStyle}
    >
      <div ref={spriteRef} className={cn('relative', dragging && 'scale-x-105 scale-y-90')}>
        <Companion
          species={presence.species}
          stage={presence.stage}
          mode={presence.mode}
          overlay={presence.overlay}
          overlaySeq={presence.overlaySeq}
          motion={presence.motion}
          outfit={presence.outfit}
          size={56}
          peekOffset={peekOffset}
          faceOverride={faceOverride}
        />
        {/* One note on click — mounted inert, lifted by WAAPI. */}
        <span
          ref={noteRef}
          className="pointer-events-none absolute left-[60%] top-1 text-primary/70 opacity-0"
        >
          <Music2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        {/* Body hitbox — the only interactive surface (inert mid-hide so the
            slide-down never shadows the player controls beneath). */}
        <div
          className={cn(
            'absolute inset-x-2 top-1 bottom-1 cursor-grab active:cursor-grabbing',
            hiding ? 'pointer-events-none' : 'pointer-events-auto'
          )}
          data-slot="companion-hitbox"
          onPointerEnter={onPointerEnter}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
      </div>
    </div>
  );
}
