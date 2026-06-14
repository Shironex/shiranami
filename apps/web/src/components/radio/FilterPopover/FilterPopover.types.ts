import type { ReactNode } from 'react';

/** A selectable option in a radio filter popover (country, language, or tag). */
export interface IFilterOption {
  /** API filter value (ISO-2 code for countries, language/tag name otherwise). */
  readonly value: string;
  /** Human-readable label shown in the list and used for type-ahead matching. */
  readonly label: string;
  /** Optional leading glyph (e.g. a country flag emoji). */
  readonly prefix?: string;
  /** radio-browser station count for this option. */
  readonly count?: number;
}

export interface IFilterPopoverProps {
  /** Visible field label, e.g. "Country". */
  readonly label: string;
  /** Label shown on the trigger when nothing is selected, e.g. "All countries". */
  readonly placeholder: string;
  /** Type-ahead input placeholder. */
  readonly searchPlaceholder: string;
  /** Empty-results message. */
  readonly emptyText: string;
  /** The selectable options. */
  readonly options: readonly IFilterOption[];
  /** Currently selected value, or null when cleared. */
  readonly value: string | null;
  /** Invoked with the next value (or null to clear) when an option is chosen. */
  readonly onSelect: (value: string | null) => void;
  /** Optional leading icon for the trigger. */
  readonly icon?: ReactNode;
  /** Disables the trigger (e.g. while the catalog is empty). */
  readonly disabled?: boolean;
}

export interface IFilterPopoverView {
  /** Whether the popover is open. */
  readonly open: boolean;
  /** Set the popover open state. */
  readonly setOpen: (open: boolean) => void;
  /** The currently selected option, or null when nothing is selected. */
  readonly selected: IFilterOption | null;
  /** Composed label shown on the trigger (selected option or placeholder). */
  readonly triggerLabel: string;
  /** Resolve a cmdk-supplied value to the real option and toggle the selection. */
  readonly onCommandSelect: (optionValue: string) => void;
}
