import type { useTranslation } from 'react-i18next';
import type { ScrobbleStatus } from '@shiranami/contracts';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** Which provider action is currently in flight, or null when idle. */
export type ScrobbleBusy = null | 'lastfm' | 'listenbrainz';

export interface IScrobbleSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Current scrobble status (connection booleans + display name + queue). */
  readonly status: ScrobbleStatus;
  /** Bound ListenBrainz token input value. */
  readonly lbToken: string;
  /** Which provider action is in flight (disables its button + shows a spinner). */
  readonly busy: ScrobbleBusy;
  /** Pending Last.fm request token between begin/finish, or null. */
  readonly lastfmPendingToken: string | null;
  /** Whether to show the "Connected as {name}" line for Last.fm. */
  readonly showLastfmUsername: boolean;
  /** Set the ListenBrainz token input value. */
  readonly onLbTokenChange: (value: string) => void;
  /** Toggle the master scrobbling switch. */
  readonly onToggle: (enabled: boolean) => void;
  /** Step 1 of Last.fm auth: open the browser and mint a request token. */
  readonly onBeginLastfm: () => void;
  /** Step 2 of Last.fm auth: exchange the approved token for a session key. */
  readonly onFinishLastfm: () => void;
  /** Abandon a pending Last.fm auth handshake. */
  readonly onCancelLastfm: () => void;
  /** Disconnect Last.fm. */
  readonly onDisconnectLastfm: () => void;
  /** Connect ListenBrainz with the entered user token. */
  readonly onConnectListenBrainz: () => void;
  /** Disconnect ListenBrainz. */
  readonly onDisconnectListenBrainz: () => void;
}
