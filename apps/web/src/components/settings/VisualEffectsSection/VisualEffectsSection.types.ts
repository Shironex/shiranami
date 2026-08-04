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

  /** Localized "Tempo breathing" toggle label. */
  readonly tempoBreathingLabel: string;
  /** Localized "Tempo breathing" toggle description. */
  readonly tempoBreathingDescription: string;
  /** Whether tempo-locked breathing is enabled. */
  readonly tempoBreathingEnabled: boolean;
  /** Toggle tempo-locked breathing. */
  readonly onTempoBreathingChange: (next: boolean) => void;
}
