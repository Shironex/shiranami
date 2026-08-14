import type {
  BackgroundRotationInterval,
  BackgroundScheduleSlot,
  BackgroundSelectionMode,
} from '@/stores/useBackgroundSelectionStore';

/** One render-ready saved-background tile. */
export interface IBackgroundTile {
  readonly id: string;
  /** Display label, with the localized fallback applied for unnamed entries. */
  readonly label: string;
  /** Thumbnail URL, or `null` outside the webview. */
  readonly thumbUrl: string | null;
  /** Whether this entry is the user's active pick. */
  readonly isActive: boolean;
  /** Localized accessible names for the tile's three actions. */
  readonly selectLabel: string;
  readonly renameLabel: string;
  readonly removeLabel: string;
}

/** One render-ready chip in the mode / interval pickers. */
export interface ISelectionChip<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly isActive: boolean;
}

/** One time-of-day schedule row. */
export interface IScheduleRow {
  readonly slot: BackgroundScheduleSlot;
  /** Localized slot name (shared with the room-light stop labels). */
  readonly label: string;
  /** The mapped entry id, or `'none'` for "the active pick". */
  readonly value: string;
}

export interface IBackgroundLibraryManagerView {
  readonly tiles: readonly IBackgroundTile[];
  /** Make an entry the active pick. */
  readonly onSelectTile: (id: string) => void;
  /** Delete an entry (and its files). */
  readonly onRemoveTile: (id: string) => void;

  /** Localized label for the add tile. */
  readonly addLabel: string;
  /** Open the picker and import a new image. */
  readonly onAdd: () => void;
  /** Whether an import is in flight. */
  readonly isAdding: boolean;
  /** Whether the library has a free slot. */
  readonly canAdd: boolean;
  /** Localized format hint under the grid. */
  readonly hint: string;
  /** Localized at-capacity notice, or `null` while slots remain. */
  readonly fullHint: string | null;

  /** The entry an inline rename is open for, or `null`. */
  readonly editingId: string | null;
  /** The rename draft. */
  readonly editingLabel: string;
  readonly onStartRename: (id: string) => void;
  readonly onEditingLabelChange: (label: string) => void;
  readonly onCommitRename: () => void;
  readonly onCancelRename: () => void;
  readonly saveLabel: string;
  readonly cancelLabel: string;

  /** Whether the mode controls show at all (needs at least two entries). */
  readonly showModeControls: boolean;
  readonly modeTitle: string;
  readonly modeDescription: string;
  readonly modeOptions: readonly ISelectionChip<BackgroundSelectionMode>[];
  readonly onSelectMode: (mode: BackgroundSelectionMode) => void;

  /** Rotation interval chips, shown only in rotation mode. */
  readonly showIntervalControls: boolean;
  readonly intervalTitle: string;
  readonly intervalDescription: string;
  readonly intervalOptions: readonly ISelectionChip<BackgroundRotationInterval>[];
  readonly onSelectInterval: (interval: BackgroundRotationInterval) => void;

  /** Time-of-day mapping rows, shown only in schedule mode. */
  readonly showScheduleControls: boolean;
  readonly scheduleTitle: string;
  readonly scheduleDescription: string;
  readonly scheduleRows: readonly IScheduleRow[];
  /** Options shared by every row: `'none'` (the active pick) plus each entry. */
  readonly scheduleOptions: readonly { readonly value: string; readonly label: string }[];
  readonly onSetScheduleSlot: (slot: BackgroundScheduleSlot, value: string) => void;
}
