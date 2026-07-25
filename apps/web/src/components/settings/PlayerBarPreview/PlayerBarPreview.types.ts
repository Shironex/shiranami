import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { InterfaceElementKey } from '@/stores/useInterfaceStore';

export type PlayerElementKey = Extract<InterfaceElementKey, `player${string}`>;

export interface IPlayerBarPreviewProps {
  /** Element to spotlight in the mock (mirrors the row hovered in settings). */
  readonly highlightedKey?: PlayerElementKey | null;
}

/** Resolved visibility + spotlight state for one collapsible mock element. */
export interface IPlayerElementState {
  /** Whether the element's toggle is on (an off element folds to zero width). */
  readonly visible: boolean;
  /** Whether the hovered settings row spotlights this element. */
  readonly highlighted: boolean;
}

/** One right-hand utility button, resolved with its icon and current state. */
export interface IPlayerUtilityElement extends IPlayerElementState {
  /** Interface element key this button mirrors. */
  readonly key: PlayerElementKey;
  /** Button glyph. */
  readonly Icon: LucideIcon;
}

/** One bar of the mini waveform seek mock. */
export interface IPlayerWaveBar {
  /** Bar height as a percentage of the strip. */
  readonly height: number;
  /** Whether the bar sits in the "played" (primary-tinted) head of the track. */
  readonly played: boolean;
}

export interface IPlayerBarElementProps {
  /** Whether the element is expanded (off folds it to zero width). */
  readonly visible: boolean;
  /** Whether the element carries the hover spotlight ring. */
  readonly highlighted: boolean;
  /** max-w-* class for the expanded state (collapse animates via max-width). */
  readonly expandedClass: string;
  /** Mock content rendered inside the element. */
  readonly children: ReactNode;
  /** Extra classes for the element frame. */
  readonly className?: string;
}

export interface IPlayerBarPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Album-art thumbnail state. */
  readonly albumArt: IPlayerElementState;
  /** Favorite glyph state. */
  readonly favorite: IPlayerElementState;
  /** Elapsed/remaining time label state (both labels share it). */
  readonly timeLabels: IPlayerElementState;
  /** Volume control state. */
  readonly volume: IPlayerElementState;
  /** Right-hand utility buttons, in bar order. */
  readonly utilityElements: readonly IPlayerUtilityElement[];
  /** Whether the seek surface is the waveform strip rather than a plain bar. */
  readonly showWaveformSeekbar: boolean;
  /** Whether the hovered settings row spotlights the seek surface. */
  readonly waveformHighlighted: boolean;
  /** Bars of the mini waveform seek mock. */
  readonly waveBars: readonly IPlayerWaveBar[];
}
