import type { ISmartMixCard } from '../MixesView.types';

export interface ISmartMixRowProps {
  /** The resolved "For you right now" smart mix this row plays. */
  readonly card: ISmartMixCard;
  /** Localized "{{count}} tracks" label for the trailing edge. */
  readonly countLabel: string;
}

export interface ISmartMixRowView {
  /** Icon for the smart-mix kind, shown in the leading tile. */
  readonly icon: ISmartMixCard['icon'];
  /** Localized title. */
  readonly title: string;
  /** Localized one-line description. */
  readonly desc: string;
  /** Localized "{{count}} tracks" label for the trailing edge. */
  readonly countLabel: string;
  /** Plays the mix — resolves its track ids against the in-memory library. */
  readonly onPlay: () => void;
}
