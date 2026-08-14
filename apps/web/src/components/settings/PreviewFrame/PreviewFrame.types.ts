import type { ReactNode } from 'react';

/**
 * Canvas geometry preset.
 *
 * - `scene`  — fixed-aspect moodbox (`aspect-[5/2]`, ≈144px at the 360px cap)
 *   for the illustrative scene mocks (room light, noise, vinyl, visualizer…).
 * - `shell`  — taller fixed-aspect app-shell mock (`aspect-[10/7]`, ≈252px).
 * - `auto`   — canvas surface sized by its content (cards, bars, meters).
 * - `none`   — no canvas element; children render directly on the frame for
 *   previews that draw their own surface (sample tiles, brand cards).
 */
export type PreviewFrameSize = 'scene' | 'shell' | 'auto' | 'none';

export interface IPreviewFrameProps {
  /**
   * Accessible name for the mock. When set, the preview announces as a single
   * image (on the canvas, or on the frame when `size` is `none`) so assistive
   * tech skips the decorative internals.
   */
  readonly label?: string;
  /** Canvas geometry preset (default `auto`). */
  readonly size?: PreviewFrameSize;
  /** Extra classes merged onto the frame surface. */
  readonly className?: string;
  /** Extra classes merged onto the canvas — layout, padding, or overrides. */
  readonly canvasClassName?: string;
  /** Footnote rendered under the canvas, inside the frame. */
  readonly caption?: ReactNode;
  /** Mock content for the canvas (or the frame itself when `size` is `none`). */
  readonly children: ReactNode;
}

export interface IPreviewFrameView {
  readonly label?: string;
  readonly frameClassName: string;
  /** Resolved canvas classes, or null when `size` is `none`. */
  readonly canvasClassName: string | null;
  readonly caption?: ReactNode;
  readonly children: ReactNode;
}
