import type { VinylLabelSource, VinylRingStyle } from '@/stores/useUIStore';

/** One render-ready chip in the vinyl label-source picker. */
export interface IVinylLabelOption {
  /** The label source this chip selects. */
  readonly value: VinylLabelSource;
  /** Localized chip label. */
  readonly label: string;
  /** Whether this source is the active one. */
  readonly isActive: boolean;
}

/** One render-ready chip in the vinyl ring-style picker. */
export interface IVinylRingOption {
  /** The ring style this chip selects. */
  readonly value: VinylRingStyle;
  /** Localized chip label. */
  readonly label: string;
  /** Whether this style is the active one. */
  readonly isActive: boolean;
}

export interface IVisualEffectsSectionView {
  /** Localized card title. */
  readonly title: string;
  /** Localized card subtitle. */
  readonly subtitle: string;

  /** Localized "Now Playing view" toggle label. */
  readonly nowPlayingLabel: string;
  /** Localized "Now Playing view" toggle description. */
  readonly nowPlayingDescription: string;
  /** Whether the immersive Now Playing view is enabled. */
  readonly nowPlayingViewEnabled: boolean;
  /** Toggle the Now Playing view. */
  readonly onNowPlayingChange: (next: boolean) => void;

  /** Localized "Vinyl record display" toggle label. */
  readonly vinylDisplayLabel: string;
  /** Localized "Vinyl record display" toggle description. */
  readonly vinylDisplayDescription: string;
  /** Whether the vinyl record display is enabled. */
  readonly vinylDisplayEnabled: boolean;
  /** Toggle the vinyl record display. */
  readonly onVinylDisplayChange: (next: boolean) => void;

  /** Localized title for the record-label picker. */
  readonly vinylLabelTitle: string;
  /** Localized description for the record-label picker. */
  readonly vinylLabelDescription: string;
  /** Render-ready chips for the record-label picker. */
  readonly vinylLabelOptions: readonly IVinylLabelOption[];
  /** Select the record-label source. */
  readonly onSelectVinylLabelSource: (source: VinylLabelSource) => void;

  /** Localized title for the reactive-ring picker. */
  readonly vinylRingTitle: string;
  /** Localized description for the reactive-ring picker. */
  readonly vinylRingDescription: string;
  /** Render-ready chips for the reactive-ring picker. */
  readonly vinylRingOptions: readonly IVinylRingOption[];
  /** Select the reactive-ring style. */
  readonly onSelectVinylRingStyle: (style: VinylRingStyle) => void;

  /** Localized "Now playing banner" toggle label. */
  readonly libraryHeroLabel: string;
  /** Localized "Now playing banner" toggle description. */
  readonly libraryHeroDescription: string;
  /** Whether the library hero/banner card is enabled. */
  readonly libraryHeroCardEnabled: boolean;
  /** Toggle the library hero/banner card. */
  readonly onLibraryHeroChange: (next: boolean) => void;

  /** Localized "Low performance mode" toggle label. */
  readonly lowPerfLabel: string;
  /** Localized "Low performance mode" toggle description. */
  readonly lowPerfDescription: string;
  /** Whether low-performance mode is enabled. */
  readonly lowPerformanceMode: boolean;
  /** Toggle low-performance mode. */
  readonly onLowPerfChange: (next: boolean) => void;

  /** Localized "Noise texture" toggle label. */
  readonly noiseLabel: string;
  /** Localized "Noise texture" toggle description. */
  readonly noiseDescription: string;
  /** Whether the noise overlay is enabled. */
  readonly noiseOverlayEnabled: boolean;
  /** Toggle the noise overlay. */
  readonly onNoiseChange: (next: boolean) => void;

  /** Localized "Artwork bloom" toggle label. */
  readonly artworkBloomLabel: string;
  /** Localized "Artwork bloom" toggle description. */
  readonly artworkBloomDescription: string;
  /** Whether the four-layer album-art bloom is enabled. */
  readonly artworkBloomEnabled: boolean;
  /** Toggle the artwork bloom. */
  readonly onArtworkBloomChange: (next: boolean) => void;

  /** Localized "Cover crossfade" toggle label. */
  readonly coverCrossfadeLabel: string;
  /** Localized "Cover crossfade" toggle description. */
  readonly coverCrossfadeDescription: string;
  /** Whether the visual dissolve between records is enabled. */
  readonly coverCrossfadeEnabled: boolean;
  /** Toggle the visual cover crossfade. */
  readonly onCoverCrossfadeChange: (next: boolean) => void;

  /** Localized "Tempo breathing" toggle label. */
  readonly tempoBreathingLabel: string;
  /** Localized "Tempo breathing" toggle description. */
  readonly tempoBreathingDescription: string;
  /** Whether tempo-locked breathing is enabled. */
  readonly tempoBreathingEnabled: boolean;
  /** Toggle tempo-locked breathing. */
  readonly onTempoBreathingChange: (next: boolean) => void;
  /**
   * Localized low-coverage hint pointing at the analysis card, or `null` when
   * the toggle is off, the library is empty, or coverage is healthy.
   */
  readonly tempoBreathingHint: string | null;
}
