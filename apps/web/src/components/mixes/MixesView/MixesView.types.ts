import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';
import type { TrackRowProps } from '@/components/shared/TrackRow';
import type { MixDefinition, MixId } from '../mixDefinitions';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type MixIcon = MixDefinition['icon'];

/** A resolved "For you right now" smart-mix card, ready to render. */
export interface ISmartMixCard {
  /** Stable id for the rendered key + play handler. */
  readonly id: string;
  /** Icon for the smart-mix kind. */
  readonly icon: MixIcon;
  /** Localized title. */
  readonly title: string;
  /** Localized one-line description. */
  readonly desc: string;
  /** Track count shown on the trailing edge. */
  readonly count: number;
  /** Plays the mix — resolves its track ids against the in-memory library. */
  readonly onPlay: () => void;
}

/** A resolved curated mix-grid card (most-played, recently-added, ...). */
export interface IMixGridCard {
  /** The mix id this card opens. */
  readonly id: MixId;
  /** Fallback icon when there isn't enough artwork for a mosaic. */
  readonly icon: MixIcon;
  /** Localized title. */
  readonly title: string;
  /** Localized one-line description. */
  readonly desc: string;
  /** Preview count for the trailing edge (0 hides the count). */
  readonly count: number;
  /** Up to four preview tracks for the album-art mosaic. */
  readonly previewTracks: Track[];
  /** Opens the mix detail view. */
  readonly onOpen: () => void;
}

export interface IMixesViewView {
  /** Bound `mixes` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Cold start: library hasn't loaded yet, so show the skeleton instead of an empty flash. */
  readonly showSkeleton: boolean;
  /** Loaded but the library is empty — renders the empty state. */
  readonly isEmpty: boolean;
  /** The selected mix's definition, or null when on the grid overview. */
  readonly selectedDef: MixDefinition | null;
  /** Tracks for the selected mix detail view. Owned array. */
  readonly mixTracks: Track[];
  /** No tracks resolved for the selected mix. */
  readonly mixIsEmpty: boolean;
  /** Main-process smart-mix generation failed — surface an honest notice. */
  readonly smartMixesFailed: boolean;
  /** Resolved "For you right now" cards. */
  readonly smartMixCards: readonly ISmartMixCard[];
  /** Resolved curated mix-grid cards. */
  readonly mixGridCards: readonly IMixGridCard[];
  /** Whether any tracks are selected — toggles the bulk action bar. */
  readonly hasSelection: boolean;
  /** Full merged library, passed to the decorative art collage. */
  readonly library: Track[];
  /** Props passed to each virtualized `TrackRow` in the detail view. */
  readonly rowProps: TrackRowProps;
  /** Returns to the mix-grid overview from a detail view. */
  readonly onBack: () => void;
  /** Plays every track in the selected mix from the top. */
  readonly onPlayAll: () => void;
  /** Plays the selected mix shuffled. */
  readonly onShuffle: () => void;
}
