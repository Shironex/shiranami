import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCompanionPresence } from '@/hooks/useCompanionPresence';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';
import type { ICompanionPerchView } from './CompanionPerch.types';

/**
 * Perch geometry. The sprite is 56px wide (52px tall at the 120×112 box);
 * its feet/pool sit ~46px down, so a -46px top overlap makes it read as
 * *sitting on* the bar's border. The right clamp keeps right-of-way for the
 * volume/queue cluster (≈264px block + gaps + the sprite's own width).
 */
export const PERCH_SIZE = 56;
export const PERCH_TOP_PX = -46;
const PERCH_RIGHT_CLAMP = 'calc(100% - 344px)';
const DRAG_THRESHOLD_PX = 4;
/** Eyes track the cursor at most this far (px in view-box scale). */
const PEEK_MAX_PX = 2;

interface IDragState {
  pointerId: number;
  startClientX: number;
  startFraction: number;
  moved: boolean;
  fraction: number;
}

function canAnimate(el: Element | null): el is Element & { animate: Element['animate'] } {
  return el != null && typeof el.animate === 'function';
}

export function useCompanionPerch(): ICompanionPerchView {
  const presence = useCompanionPresence();
  const sanctuaryActive = useSanctuaryStore(s => s.sanctuaryActive);
  const perchFraction = useCompanionStore(s => s.perchFraction);
  const setPerchFraction = useCompanionStore(s => s.setPerchFraction);

  const [peekOffset, setPeekOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLSpanElement | null>(null);
  const dragState = useRef<IDragState | null>(null);

  function barWidth(): number {
    const parent = wrapRef.current?.offsetParent;
    return parent instanceof HTMLElement ? parent.clientWidth : 0;
  }

  /** Peek: pupils lean toward the cursor, clamped to ±2px. */
  function updatePeek(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!presence.motion || dragState.current?.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const clamp = (v: number) => Math.max(-PEEK_MAX_PX, Math.min(PEEK_MAX_PX, v * PEEK_MAX_PX));
    setPeekOffset({ x: clamp(dx), y: clamp(dy) });
  }

  function onPointerEnter(event: ReactPointerEvent<HTMLDivElement>): void {
    updatePeek(event);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragState.current;
    if (drag && event.pointerId === drag.pointerId) {
      const deltaX = event.clientX - drag.startClientX;
      if (!drag.moved && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;
      const width = barWidth();
      if (width <= 0) return;
      drag.moved = true;
      drag.fraction = Math.min(1, Math.max(0, drag.startFraction + deltaX / width));
      setDragging(true);
      setDragFraction(drag.fraction);
      setPeekOffset(null);
      return;
    }
    updatePeek(event);
  }

  function onPointerLeave(): void {
    setPeekOffset(null);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startFraction: dragFraction ?? perchFraction,
      moved: false,
      fraction: dragFraction ?? perchFraction,
    };
  }

  /** Click (no drag): one happy bounce + one note glyph — nothing farmable. */
  function playClickFlourish(): void {
    if (!presence.motion) return;
    const sprite = spriteRef.current;
    if (canAnimate(sprite)) {
      sprite.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-7px)', offset: 0.35 },
          { transform: 'translateY(0)', offset: 0.7 },
          { transform: 'translateY(-2px)', offset: 0.85 },
          { transform: 'translateY(0)' },
        ],
        { duration: 450, easing: 'ease-out' }
      );
    }
    const note = noteRef.current;
    if (canAnimate(note)) {
      note.animate(
        [
          { opacity: 0, transform: 'translateY(0) rotate(0deg)' },
          { opacity: 0.7, transform: 'translateY(-10px) rotate(6deg)', offset: 0.35 },
          { opacity: 0, transform: 'translateY(-24px) rotate(12deg)' },
        ],
        { duration: 900, easing: 'ease-out' }
      );
    }
  }

  /** Release after a drag: a 3-wobble settle. */
  function playSettleWobble(): void {
    if (!presence.motion) return;
    const sprite = spriteRef.current;
    if (!canAnimate(sprite)) return;
    sprite.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-6deg)', offset: 0.25 },
        { transform: 'rotate(4deg)', offset: 0.55 },
        { transform: 'rotate(-2deg)', offset: 0.8 },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 500, easing: 'ease-out' }
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragState.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragState.current = null;
    if (drag.moved) {
      setPerchFraction(drag.fraction);
      setDragging(false);
      setDragFraction(null);
      playSettleWobble();
      return;
    }
    playClickFlourish();
  }

  function onPointerCancel(): void {
    dragState.current = null;
    setDragging(false);
    setDragFraction(null);
    setPeekOffset(null);
  }

  const fraction = dragFraction ?? perchFraction;
  const fractionPercent = (fraction * 100).toFixed(2);

  return {
    // The perch unmounts when toggled off; Sanctuary replaces the whole
    // shell, but the guard also covers the compact-window edge.
    visible: presence.enabled && !sanctuaryActive,
    presence,
    wrapStyle: {
      left: `clamp(8px, ${fractionPercent}%, ${PERCH_RIGHT_CLAMP})`,
      top: PERCH_TOP_PX,
      width: PERCH_SIZE,
    },
    hiding: presence.mode === 'hiding',
    dragging,
    peekOffset,
    faceOverride: dragging ? 'open' : null,
    wrapRef,
    spriteRef,
    noteRef,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  };
}
