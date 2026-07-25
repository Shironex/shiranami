import type { LucideIcon } from 'lucide-react';

/** One drifting note in the send-off cluster. */
export interface ICompletionFlourishNote {
  /** Glyph rendered for this note. */
  readonly Icon: LucideIcon;
  /** Horizontal start offset from center (px). */
  readonly x: number;
  /** Extra horizontal drift accrued while rising (px). */
  readonly drift: number;
  /** Vertical travel — negative rises (px). */
  readonly rise: number;
  /** Glyph size (px). */
  readonly size: number;
  /** Stagger delay (s). */
  readonly delay: number;
  /** Gentle tilt at the apex (deg). */
  readonly rotate: number;
}

/**
 * The flourish plays one fixed cluster for as long as it is mounted — the
 * wizard decides *whether* to mount it — so its props surface is intentionally
 * empty and exists to keep the per-component contract shape consistent.
 */
export interface ICompletionFlourishProps {}

export interface ICompletionFlourishView {
  /** The note cluster, in emission order. */
  readonly notes: readonly ICompletionFlourishNote[];
}
