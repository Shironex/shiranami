import type { LucideIcon } from 'lucide-react';
import type { AppView } from '@/stores/useViewStore';

export interface ISidebarPreviewProps {
  /** View id to spotlight in the mock (mirrors the row hovered in settings). */
  readonly highlightedId?: AppView | null;
}

/** One resolved nav item rendered in the mock sidebar. */
export interface ISidebarPreviewItem {
  /** Stable view id. */
  readonly id: AppView;
  /** Nav icon component. */
  readonly Icon: LucideIcon;
  /** Localized item label. */
  readonly label: string;
  /** Whether this item is the spotlighted (active) row. */
  readonly active: boolean;
}

export interface ISidebarPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Visible nav items, pre-resolved with active flags + labels. */
  readonly items: readonly ISidebarPreviewItem[];
  /** Whether the playlists shelf is shown in the mock. */
  readonly showPlaylists: boolean;
}
