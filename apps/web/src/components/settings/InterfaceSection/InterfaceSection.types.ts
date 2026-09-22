import type { useTranslation } from 'react-i18next';
import type { SensorDescriptor, SensorOptions, DragEndEvent } from '@dnd-kit/core';
import type { InterfaceElementKey } from '@/stores/useInterfaceStore';
import type { SidePanelSide } from '@/stores/useLayoutStore';
import type { OverviewSectionId } from '@/lib/overview-sections';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export type OverviewWidgetKey = Extract<InterfaceElementKey, `overview${string}`>;
export type PlayerElementKey = Extract<InterfaceElementKey, `player${string}`>;

/** One toggle row, pre-resolved with its localized strings + current value. */
export interface IInterfaceToggle<TKey extends InterfaceElementKey = InterfaceElementKey> {
  /** Interface element key this row controls. */
  readonly key: TKey;
  /** Localized row label. */
  readonly label: string;
  /** Localized row description. */
  readonly description: string;
  /** Current on/off value. */
  readonly checked: boolean;
  /** Whether to render the top divider (every row except the first). */
  readonly divider: boolean;
}

/** One draggable Overview section row: a label plus its widget toggles. */
export interface IOverviewSectionRow {
  /** Section id (also the sortable id). */
  readonly id: OverviewSectionId;
  /** Localized section label (equals the widget label for single-widget sections). */
  readonly label: string;
  /** Accessible label for the drag handle. */
  readonly dragHandleLabel: string;
  /** Toggle rows for the widgets inside this section (one for most sections). */
  readonly toggles: readonly IInterfaceToggle<OverviewWidgetKey>[];
}

/** One side-panel position select option. */
export interface IInterfaceSideOption {
  /** Persisted value. */
  readonly value: SidePanelSide;
  /** Localized option label. */
  readonly label: string;
}

export interface IInterfaceSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether any interface element differs from default (shows the reset link). */
  readonly isModified: boolean;
  /** Reset all interface element visibility to defaults. */
  readonly onResetInterface: () => void;

  // --- Layout ---
  /** Current side-panel position. */
  readonly sidePanelSide: SidePanelSide;
  /** Side-panel position options, pre-resolved. */
  readonly sideOptions: readonly IInterfaceSideOption[];
  /** Change the side-panel position. */
  readonly onSelectSide: (side: SidePanelSide) => void;

  // --- Top bar ---
  /** Whether the language switcher chip group is shown. */
  readonly topBarLanguageSwitcher: boolean;
  /** Toggle the top-bar language switcher. */
  readonly onToggleTopBarLanguageSwitcher: (visible: boolean) => void;

  // --- Overview widgets ---
  /** Draggable Overview section rows in the user-chosen order. */
  readonly overviewSections: readonly IOverviewSectionRow[];
  /** The ordered section ids, for the dnd-kit sortable context. */
  readonly overviewOrderIds: OverviewSectionId[];
  /** Reorder hint shown above the section list. */
  readonly overviewReorderHint: string;
  /** Pointer/keyboard sensors for the section drag list. */
  readonly overviewSensors: SensorDescriptor<SensorOptions>[];
  /** Commit a section drag (dnd-kit drag end). */
  readonly onReorderOverview: (event: DragEndEvent) => void;
  /** Currently spotlighted overview widget (mirrors the hovered row). */
  readonly hoveredOverviewKey: OverviewWidgetKey | null;
  /** Set/clear the hovered overview widget. */
  readonly onHoverOverview: (key: OverviewWidgetKey, hovering: boolean) => void;

  // --- Player-bar elements ---
  /** Player-bar element toggle rows, pre-resolved. */
  readonly playerToggles: readonly IInterfaceToggle<PlayerElementKey>[];
  /** Currently spotlighted player-bar element (mirrors the hovered row). */
  readonly hoveredPlayerKey: PlayerElementKey | null;
  /** Set/clear the hovered player-bar element. */
  readonly onHoverPlayer: (key: PlayerElementKey, hovering: boolean) => void;

  // --- Shared toggle handler ---
  /** Set an interface element's visibility. */
  readonly onSetVisible: (key: InterfaceElementKey, visible: boolean) => void;
}
