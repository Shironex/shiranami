import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { ICompanionPresence } from '@/hooks/useCompanionPresence';
import type { CompanionFace } from '@/components/companion/Companion';

export interface ICompanionPerchView {
  /** False unmounts the perch entirely (master toggle off / sanctuary). */
  readonly visible: boolean;
  readonly presence: ICompanionPresence;
  /** Horizontal seat along the bar's top edge (clamped off the controls). */
  readonly wrapStyle: CSSProperties;
  /** Lyric focus: slide down behind the bar edge. */
  readonly hiding: boolean;
  readonly dragging: boolean;
  readonly peekOffset: { readonly x: number; readonly y: number } | null;
  /** Wide eyes while dragged. */
  readonly faceOverride: CompanionFace | null;
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly spriteRef: RefObject<HTMLDivElement | null>;
  readonly noteRef: RefObject<HTMLSpanElement | null>;
  readonly onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerLeave: () => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: () => void;
}
