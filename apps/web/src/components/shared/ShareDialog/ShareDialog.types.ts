import type { useTranslation } from 'react-i18next';
import type { UseShareLinkResult } from '@/hooks/useShareLink';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IShareDialogProps {
  /** Whether the share dialog is open. */
  readonly open: boolean;
  /** Open-state controller (Radix `onOpenChange`). */
  readonly onOpenChange: (open: boolean) => void;
  /** Whether a single track or a whole playlist is being shared. */
  readonly type: 'track' | 'playlist';
  /** The track or playlist id to mint a share link for. */
  readonly id: string;
}

export interface IShareDialogView {
  /** Bound `share` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Share-link state machine phase (`idle` | `loading` | `success` | `error`). */
  readonly state: UseShareLinkResult['state'];
  /** The minted share URL (populated in the `success` state). */
  readonly shareUrl: string;
  /** Whether the share URL was just copied (drives the copy-button checkmark). */
  readonly copied: boolean;
  /** Error message to show in the `error` state (falls back to a generic string). */
  readonly displayError: string;
  /** Minutes remaining until the share link expires. */
  readonly minutesLeft: number;
  /** URL-encoded QR-code image src for the share link. */
  readonly qrSrc: string;
  /** (Re)generate the share link — also used by the error-state retry button. */
  readonly generateLink: () => void;
  /** Copy the share URL to the clipboard and flash the copied state. */
  readonly handleCopy: () => void;
}
