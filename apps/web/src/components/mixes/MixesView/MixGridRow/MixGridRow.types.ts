import type { ReactElement } from 'react';
import type { IMixGridCard } from '../MixesView.types';

/**
 * Artwork treatment for the row's leading tile. Four or more preview tracks
 * fill a 2x2 mosaic, one to three show a single cover, none fall back to the
 * mix's own icon.
 */
export type MixGridRowArt = 'mosaic' | 'single' | 'icon';

export interface IMixGridRowProps {
  /** The resolved curated mix this row opens. */
  readonly card: IMixGridCard;
  /** Localized "{{count}} tracks" label for the trailing edge. */
  readonly countLabel: string;
}

export interface IMixGridRowView {
  /** Fallback icon for the leading tile when there is no preview artwork. */
  readonly icon: IMixGridCard['icon'];
  /** Which artwork treatment the leading tile gets. */
  readonly art: MixGridRowArt;
  /** Up to four decorative `<img>` tiles for the 2x2 mosaic. */
  readonly mosaicTiles: readonly ReactElement[];
  /** Cover URL for the single-artwork treatment. */
  readonly singleArt: string | undefined;
  /** Localized mix title. */
  readonly title: string;
  /** Localized one-line description. */
  readonly desc: string;
  /** Whether the trailing track count renders — an empty mix hides it. */
  readonly showCount: boolean;
  /** Localized "{{count}} tracks" label for the trailing edge. */
  readonly countLabel: string;
  /** Opens the mix detail view. */
  readonly onOpen: () => void;
}
