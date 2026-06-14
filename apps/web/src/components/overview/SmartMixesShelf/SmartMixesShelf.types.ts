import type { LucideIcon } from 'lucide-react';

/** One render-ready smart-mix chip. */
export interface ISmartMixChip {
  readonly id: string;
  /** Localized chip title. */
  readonly title: string;
  /** Icon for the mix kind. */
  readonly Icon: LucideIcon;
  /** Local track ids the chip resolves + plays. */
  readonly trackIds: string[];
}

export interface ISmartMixesShelfView {
  /** Whether any mix qualified — the shelf hides entirely when false. */
  readonly hasMixes: boolean;
  /** Section heading. */
  readonly title: string;
  /** Fully computed chips. */
  readonly chips: readonly ISmartMixChip[];
  /** Resolve a chip's track ids against the live library and start playback. */
  readonly playMix: (trackIds: string[]) => void;
}
