export interface IPlaybackSectionView {
  /** Localized card title. */
  readonly title: string;
  /** Localized card subtitle. */
  readonly subtitle: string;

  /** Localized "resume position" row label. */
  readonly resumeLabel: string;
  /** Localized "resume position" row description. */
  readonly resumeDescription: string;
  /** Whether playback position is remembered across restarts. */
  readonly rememberPlaybackPosition: boolean;
  /** Toggle the remember-position setting. */
  readonly onRememberChange: (next: boolean) => void;

  /** Localized "crossfade" row label. */
  readonly crossfadeLabel: string;
  /** Localized "crossfade" row description. */
  readonly crossfadeDescription: string;
  /** Whether crossfade is enabled. */
  readonly crossfadeEnabled: boolean;
  /** Toggle crossfade. */
  readonly onCrossfadeEnabledChange: (next: boolean) => void;
  /** Localized "duration" slider label. */
  readonly durationLabel: string;
  /** Current crossfade duration in seconds. */
  readonly crossfadeDuration: number;
  /** Minimum crossfade duration (slider bound). */
  readonly crossfadeMin: number;
  /** Maximum crossfade duration (slider bound). */
  readonly crossfadeMax: number;
  /** Set the crossfade duration in seconds. */
  readonly onCrossfadeDurationChange: (seconds: number) => void;

  /** Localized "loudness" row label. */
  readonly loudnessLabel: string;
  /** Localized "loudness" row description. */
  readonly loudnessDescription: string;
  /** Whether loudness leveling is enabled. */
  readonly loudnessEnabled: boolean;
  /** Toggle loudness leveling. */
  readonly onLoudnessEnabledChange: (next: boolean) => void;
  /** Localized "loudness target" slider label. */
  readonly loudnessTargetLabel: string;
  /** Current loudness target in LUFS. */
  readonly loudnessTargetLufs: number;
  /** Minimum loudness target (slider bound). */
  readonly loudnessMin: number;
  /** Maximum loudness target (slider bound). */
  readonly loudnessMax: number;
  /** Set the loudness target in LUFS. */
  readonly onLoudnessTargetChange: (lufs: number) => void;

  /** Whether a library-wide loudness analysis run is in progress. */
  readonly loudnessAnalysisRunning: boolean;
  /** Localized analysis status line (progress or call-to-action). */
  readonly loudnessAnalysisStatus: string;
  /** Localized "Analyze" button label. */
  readonly loudnessAnalyzeLabel: string;
  /** Localized "Cancel" button label. */
  readonly loudnessCancelLabel: string;
  /** Start a library-wide loudness analysis run. */
  readonly onStartLoudnessAnalysis: () => void;
  /** Cancel the in-progress loudness analysis run. */
  readonly onCancelLoudnessAnalysis: () => void;

  /** Localized "tempo & key" row label. */
  readonly analysisLabel: string;
  /** Localized "tempo & key" row description. */
  readonly analysisDescription: string;
  /** Whether a library-wide tempo + key analysis run is in progress. */
  readonly analysisRunning: boolean;
  /** Localized analysis status line (progress or call-to-action). */
  readonly analysisStatus: string;
  /** Localized "Analyze" button label. */
  readonly analysisAnalyzeLabel: string;
  /** Localized "Cancel" button label. */
  readonly analysisCancelLabel: string;
  /** Start a library-wide tempo + key analysis run. */
  readonly onStartAnalysis: () => void;
  /** Cancel the in-progress tempo + key analysis run. */
  readonly onCancelAnalysis: () => void;

  /** Localized "sleep fade" row label. */
  readonly sleepFadeLabel: string;
  /** Localized "sleep fade" row description. */
  readonly sleepFadeDescription: string;
  /** Localized "sleep fade duration" slider label. */
  readonly sleepFadeDurationLabel: string;
  /** Current sleep-fade duration in seconds. */
  readonly sleepFadeDuration: number;
  /** Minimum sleep-fade duration (slider bound). */
  readonly sleepFadeMin: number;
  /** Maximum sleep-fade duration (slider bound). */
  readonly sleepFadeMax: number;
  /** Set the sleep-fade duration in seconds. */
  readonly onSleepFadeDurationChange: (seconds: number) => void;
}
