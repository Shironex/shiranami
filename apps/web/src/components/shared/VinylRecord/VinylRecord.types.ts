import type { RefObject } from 'react';
import type { FrequencySource } from '@/components/player/visualizer-source';
import type { VinylLabelSource, VinylRingStyle } from '@/stores/useUIStore';

export interface IVinylRecordProps {
  /** Album artwork URL for the 'artwork' label; the brand mark fills in when absent. */
  readonly albumArt?: string | null;
  /** `alt` for the artwork label image. */
  readonly albumAlt: string;
  /**
   * Optional external frequency source for the reactive ring (stories /
   * previews). The global audio-engine analyser is used when omitted.
   */
  readonly source?: FrequencySource;
  /** Extra classes for the outer square wrapper (sizing/position). */
  readonly className?: string;
}

export interface IVinylRecordView {
  /** The rotating disc element — the hook eases its spin playback rate. */
  readonly discRef: RefObject<HTMLDivElement | null>;
  /** Canvas for the audio-reactive ring (mounted only while `ringVisible`). */
  readonly ringCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Render the reactive ring canvas (ring on and decorative motion allowed). */
  readonly ringVisible: boolean;
  /** Render the calm fixed halo instead (ring on but motion suppressed). */
  readonly staticRingVisible: boolean;
  /** The user's label preference, resolved from settings. */
  readonly labelSource: VinylLabelSource;
  /** Ring style, resolved from settings (drives the draw callback). */
  readonly ringStyle: VinylRingStyle;
  /** Album artwork URL for the artwork label (prop passthrough). */
  readonly albumArt: string | null | undefined;
  /** `alt` for the artwork label image (prop passthrough). */
  readonly albumAlt: string;
  /** Extra wrapper classes (prop passthrough). */
  readonly className: string | undefined;
}
