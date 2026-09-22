// Wire types for the Library Doctor (feature wave F8) — decode-truth health
// findings. v2-only: v1's decoder could not see truncation, damaged packets or
// true peaks, so none of this had a channel to port.
//
// Findings carry typed numbers, never prebuilt messages: the renderer owns the
// copy (en + pl) and the formatting.

/** One track offered up for a health check. */
export interface DoctorScanInput {
  id: string;
  filePath: string;
  title: string;
  /** The duration the library believes (tag metadata, seconds), if any. */
  duration?: number | null;
}

/** What kind of defect (or caveat) a finding reports. */
export type DoctorFindingKind =
  | 'missingFile'
  | 'unreadable'
  | 'noAudio'
  | 'unsupportedCodec'
  | 'truncated'
  | 'damagedPackets'
  | 'durationMismatch'
  | 'clipping'
  | 'silent';

/** How loudly the renderer should present a finding. */
export type DoctorSeverity = 'error' | 'warning' | 'info';

/** One per-file finding. */
export interface DoctorFinding {
  trackId: string;
  title: string;
  filePath: string;
  kind: DoctorFindingKind;
  severity: DoctorSeverity;
  /** `durationMismatch`: what the container claims, in seconds. */
  expectedSeconds?: number | null;
  /** `durationMismatch`: what actually decoded, in seconds. */
  actualSeconds?: number | null;
  /** `damagedPackets`: how many packets were skipped. */
  skippedPackets?: number | null;
  /** `clipping`: the measured true peak, in dBTP. */
  truePeakDb?: number | null;
}

/** What a finished — or cancelled — health check covered. */
export interface DoctorScanResult {
  scanned: number;
  healthy: number;
  /** True when the run stopped early; the findings are the partial truth. */
  cancelled: boolean;
  findings: DoctorFinding[];
}

/** Per-file progress event streamed during a health check. */
export interface DoctorProgress {
  current: number;
  total: number;
  trackName: string;
}
