import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export type EqLayout = 'popover' | 'section';

export interface IEqualizerPanelProps {
  /** When true, renders vertical sliders at a larger size for the settings panel. */
  readonly layout?: EqLayout;
  /** Omit the trigger + popover chrome and just render the controls. */
  readonly inline?: boolean;
}

/** A selectable preset option (built-in or user-defined). */
export interface IEqPresetOption {
  readonly id: string;
  readonly label: string;
}

/** A render-ready EQ band, carrying its current gain + per-band labels. */
export interface IEqBandRow {
  /** Center frequency in Hz (also the React key). */
  readonly freq: number;
  /** Band index into the gains array. */
  readonly index: number;
  /** Current gain for the band in dB. */
  readonly value: number;
  /** Accessible/axis label for the band. */
  readonly label: string;
  /** Human-readable band name (tooltip heading). */
  readonly bandName: string;
  /** Formatted current-gain tooltip subline. */
  readonly gainLabel: string;
}

/** Save/rename dialog state. */
export interface IEqNameDialog {
  readonly mode: 'save' | 'rename';
  /** Preset id being renamed; null when saving a new preset. */
  readonly targetId: string | null;
  readonly value: string;
}

/** Delete-confirmation target. */
export interface IEqDeleteTarget {
  readonly id: string;
  readonly name: string;
}

export interface IEqualizerPanelView {
  /** Bound `equalizer` namespace translator. */
  readonly t: TranslateFn;
  /** Bound `player` namespace translator (trigger tooltip). */
  readonly tPlayer: TranslateFn;
  /** Effective layout (defaulted). */
  readonly layout: EqLayout;
  /** Whether the controls render inline (no popover chrome). */
  readonly inline: boolean;

  /** Whether the EQ is enabled. */
  readonly enabled: boolean;
  /** Whether the active indicator dot should show (enabled + non-flat/custom). */
  readonly active: boolean;
  /** Current preamp gain in dB. */
  readonly preampDb: number;
  /** Formatted preamp gain label. */
  readonly preampLabel: string;
  /** Preamp range floor in dB. */
  readonly preampMin: number;
  /** Preamp range ceiling in dB. */
  readonly preampMax: number;
  /** Preamp slider step in dB. */
  readonly preampStep: number;
  /** Tailwind height class for the band sliders. */
  readonly bandHeightClass: string;

  /** Current Select value (`custom:<id>` for user presets). */
  readonly selectValue: string;
  /** Label shown in the Select trigger for the current preset. */
  readonly selectTriggerLabel: string;
  /** Built-in preset options. */
  readonly presetOptions: readonly IEqPresetOption[];
  /** User-defined preset options. */
  readonly userPresetOptions: readonly IEqPresetOption[];
  /** Whether any user presets exist (drives the user group). */
  readonly hasUserPresets: boolean;
  /** Id of the active user preset, if any. */
  readonly activeCustomId: string | null;
  /** Max length for preset names. */
  readonly nameMaxLength: number;
  /** Render-ready EQ band rows. */
  readonly bandRows: readonly IEqBandRow[];

  /** Save/rename dialog state (null when closed). */
  readonly nameDialog: IEqNameDialog | null;
  /** Delete-confirmation target (null when closed). */
  readonly deleteTarget: IEqDeleteTarget | null;

  /** Toggle the popover open state (chrome layout only). */
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;

  /** Toggle the EQ on/off. */
  readonly onToggleEnabled: (next: boolean) => void;
  /** Set the gain for a band index. */
  readonly onBandChange: (index: number, db: number) => void;
  /** Set the preamp gain. */
  readonly onPreampChange: (db: number) => void;
  /** Apply a preset (built-in or `custom:<id>`). */
  readonly onPresetChange: (value: string) => void;
  /** Reset all bands + preamp. */
  readonly onReset: () => void;

  /** Open the "save current as preset" dialog. */
  readonly onOpenSaveDialog: () => void;
  /** Open the rename dialog for the active user preset. */
  readonly onOpenRenameDialog: () => void;
  /** Open the delete confirmation for the active user preset. */
  readonly onOpenDeleteDialog: () => void;
  /** Update the name-dialog draft value. */
  readonly onNameDraftChange: (value: string) => void;
  /** Commit the save/rename dialog. */
  readonly onSubmitNameDialog: () => void;
  /** Close the save/rename dialog. */
  readonly onCloseNameDialog: () => void;
  /** Confirm the delete. */
  readonly onConfirmDelete: () => void;
  /** Close the delete confirmation. */
  readonly onCloseDeleteDialog: () => void;
  /**
   * Whether an interact-outside event on the popover should be prevented
   * (a spawned save/delete dialog is open).
   */
  readonly shouldKeepPopoverOpen: () => boolean;
}
