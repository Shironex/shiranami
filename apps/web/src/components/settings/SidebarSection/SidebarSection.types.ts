import type { LucideIcon } from 'lucide-react';
import type { useTranslation } from 'react-i18next';
import type { SensorDescriptor, SensorOptions, DragEndEvent } from '@dnd-kit/core';
import type { LandingView } from '@/stores/useUIStore';
import type { AppView } from '@/stores/useViewStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One reorderable sidebar row, pre-resolved with its localized strings. */
export interface ISidebarSectionRow {
  /** Stable view id (drag id). */
  readonly id: AppView;
  /** Nav icon component. */
  readonly Icon: LucideIcon;
  /** Localized item label. */
  readonly label: string;
  /** Whether the item is always visible (toggle disabled). */
  readonly alwaysOn: boolean;
  /** Whether the item is currently visible. */
  readonly visible: boolean;
  /** Whether the item is experimental (shows a badge). */
  readonly experimental: boolean;
  /** Localized drag-handle aria-label for this row. */
  readonly dragHandleLabel: string;
}

/** One landing-view select option. */
export interface ISidebarLandingOption {
  /** Persisted value. */
  readonly value: LandingView;
  /** Localized option label. */
  readonly label: string;
}

export interface ISidebarSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** DnD sensors for the sortable list (mutable for dnd-kit's prop). */
  readonly sensors: SensorDescriptor<SensorOptions>[];
  /** Reorderable rows, in user order, pre-resolved with labels + flags. */
  readonly rows: readonly ISidebarSectionRow[];
  /** Ordered drag ids for the SortableContext (mutable for dnd-kit's prop). */
  readonly orderedIds: AppView[];
  /** Currently hovered row id (mirrors the preview spotlight). */
  readonly hoveredId: AppView | null;

  /** Shared always-on caption. */
  readonly alwaysOnLabel: string;
  /** Shared experimental badge label. */
  readonly experimentalLabel: string;

  // --- Landing view ---
  /** Current landing-view selection. */
  readonly landingView: LandingView;
  /** Landing-view options, pre-resolved. */
  readonly landingOptions: readonly ISidebarLandingOption[];
  /** Change the landing view. */
  readonly onSelectLandingView: (value: LandingView) => void;

  // --- Playlists shelf ---
  /** Whether the playlists shelf is shown in the sidebar. */
  readonly playlistsVisible: boolean;
  /** Toggle the playlists shelf. */
  readonly onSetPlaylistsVisible: (visible: boolean) => void;

  // --- Handlers ---
  /** Toggle a sidebar item's visibility. */
  readonly onToggleItem: (id: AppView) => void;
  /** Set/clear the hovered row. */
  readonly onHoverItem: (id: AppView, hovering: boolean) => void;
  /** Reorder rows after a drag completes. */
  readonly onDragEnd: (event: DragEndEvent) => void;
  /** Reset the sidebar to its default order + visibility. */
  readonly onReset: () => void;
}
