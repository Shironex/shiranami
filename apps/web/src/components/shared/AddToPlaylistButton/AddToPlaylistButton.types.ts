import type { CSSProperties, RefObject } from 'react';
import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IAddToPlaylistButtonProps {
  /** Track to add to a playlist when the popover picker resolves. */
  readonly trackId: string;
  /** Extra classes merged onto the trigger button. */
  readonly className?: string;
}

export interface IAddToPlaylistButtonView {
  /** Bound `contextMenu` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the playlist-picker popover is open. */
  readonly isOpen: boolean;
  /** Ref for the trigger button — anchors the portalled popover. */
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  /** Ref for the portalled popover — used for outside-click detection. */
  readonly popoverRef: RefObject<HTMLDivElement | null>;
  /** Fixed-position style for the portalled popover, derived from the trigger. */
  readonly popoverStyle: CSSProperties;
  /** Toggles the popover open/closed (stops propagation to the row). */
  readonly onToggle: (event: React.MouseEvent) => void;
  /** Closes the popover (passed to the picker as its done handler). */
  readonly onClose: () => void;
}
