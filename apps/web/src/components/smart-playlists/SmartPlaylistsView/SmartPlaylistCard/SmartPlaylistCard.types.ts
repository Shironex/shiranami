import type { SmartPlaylist } from '@shiranami/contracts';

export interface ISmartPlaylistCardProps {
  /** The smart playlist this card represents. */
  readonly playlist: SmartPlaylist;
  /** Opens a smart playlist's detail view by id. */
  readonly onOpen: (id: string) => void;
}

export interface ISmartPlaylistCardView {
  /** Playlist name shown on the card's first line. */
  readonly name: string;
  /** Localized "{{count}} rules" summary shown beneath the name. */
  readonly ruleSummary: string;
  /** Opens this card's playlist (the id is already bound). */
  readonly onOpen: () => void;
}
