import type { ToolAutoUpdateState } from '@shiranami/contracts';

export interface IToolAutoUpdatePanelProps {
  /** Whether the user opted in to automatic updates. */
  readonly enabled: boolean;
  /** Whether the switch is disabled (backend not answered, or unsupported). */
  readonly disabled: boolean;
  /** Turn automatic updates on or off. */
  readonly onEnabledChange: (enabled: boolean) => void;
  /** What automatic updating has done so far, or null when unknown. */
  readonly record: ToolAutoUpdateState | null;
  /** Whether ffmpeg is updated automatically here (not on macOS). */
  readonly ffmpegIncluded: boolean;
}

/** One tool's status line, pre-composed. */
export interface IToolAutoUpdateRow {
  /** The tool's name as users know it ("yt-dlp", "ffmpeg"). */
  readonly tool: string;
  /** "Updated automatically to X", or null when it never has been. */
  readonly updatedText: string | null;
  /** "Last checked …", or "Not checked yet". */
  readonly checkedText: string;
}

export interface IToolAutoUpdatePanelView {
  /** Localized switch label. */
  readonly label: string;
  /** Localized switch description. */
  readonly description: string;
  /** Whether the switch is on. */
  readonly checked: boolean;
  /** Whether the switch is disabled. */
  readonly disabled: boolean;
  /** Toggle handler. */
  readonly onCheckedChange: (checked: boolean) => void;
  /** Status lines, one per tool; empty while the setting is off. */
  readonly rows: readonly IToolAutoUpdateRow[];
}
