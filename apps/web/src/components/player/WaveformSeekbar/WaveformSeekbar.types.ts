import type { PointerEvent, KeyboardEvent, RefObject } from 'react';

export interface IWaveformSeekbarProps {
  /** Tailwind height class for the canvas. Defaults to the compact player-bar
   *  size; the full-screen Now Playing view passes a taller one. */
  readonly canvasClassName?: string;
}

/** View model for the waveform seek bar. */
export interface IWaveformSeekbarView {
  /** Localized `aria-label` for the slider. */
  readonly label: string;
  /** Lower bound for the slider (always 0). */
  readonly valueMin: number;
  /** Upper bound — the track duration, or a 100 fallback when unknown. */
  readonly valueMax: number;
  /** Current (or scrub) position in seconds for `aria-valuenow`. */
  readonly valueNow: number;
  /** Human-readable "m:ss of m:ss" string for `aria-valuetext`. */
  readonly valueText: string;
  /** Ref for the clickable track element (measured for pointer math). */
  readonly trackRef: RefObject<HTMLDivElement | null>;
  /** Ref for the waveform canvas (drawn imperatively). */
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Begin a pointer scrub/drag. */
  readonly onPointerDown: (event: PointerEvent) => void;
  /** Keyboard seeking (arrows / page / home-end). */
  readonly onKeyDown: (event: KeyboardEvent) => void;
}
