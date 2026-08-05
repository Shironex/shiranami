import type { RefObject, CSSProperties } from 'react';
import type {
  CompanionMode,
  CompanionOverlay,
  CompanionSpecies,
  CompanionStage,
} from '@/lib/companionMachine';

/** Face variant shown by the sprite (drives the `data-face` attribute). */
export type CompanionFace = 'open' | 'half' | 'closed';

export interface ICompanionProps {
  readonly species: CompanionSpecies;
  readonly stage: CompanionStage;
  readonly mode: CompanionMode;
  /** One-shot overlay riding on the loop; null = none. */
  readonly overlay?: CompanionOverlay | null;
  /** Bumped when an overlay (re)starts — restarts the WAAPI run (cancel, never queue). */
  readonly overlaySeq?: number;
  /** Decorative motion allowed; false = static first frame of every state. */
  readonly motion: boolean;
  /** Rendered width in px (56 = player perch, 64 = Now Playing). */
  readonly size?: number;
  readonly className?: string;
  /**
   * Peek: pupil offset in px (pre-clamped ±2 by the caller). Non-null implies
   * hover — the body also leans slightly toward the cursor.
   */
  readonly peekOffset?: { readonly x: number; readonly y: number } | null;
  /** Surface override for the face (drag = wide eyes); defaults from mode. */
  readonly faceOverride?: CompanionFace | null;
}

export interface ICompanionView {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly face: CompanionFace;
  /** Loop utility class for the rig group. */
  readonly rigClass: string | undefined;
  /** Grooving hop on the wrapper group. */
  readonly hopClass: string | undefined;
  /** Rendered height, preserving the 120×112 view box. */
  readonly height: number;
  /** Peek/lean custom properties applied to the sprite root. */
  readonly rootStyle: CSSProperties | undefined;
}
