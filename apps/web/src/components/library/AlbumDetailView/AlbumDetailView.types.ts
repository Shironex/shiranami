import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** A single track row with its flat index into the album's queue. */
export interface IAlbumTrackRow {
  readonly id: string;
  readonly track: Track;
  /** Index into the flat `albumTracks` queue — drives row indexing + playback. */
  readonly index: number;
}

/** A disc's worth of rows; `heading` is null for single-disc albums. */
export interface IAlbumDiscBlock {
  readonly key: string;
  /** Localized disc heading, or null when the album is single-disc. */
  readonly heading: string | null;
  readonly rows: readonly IAlbumTrackRow[];
}

export interface IAlbumDetailViewView {
  /** Bound `library` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** No album is selected — the view renders nothing. */
  readonly hasAlbum: boolean;
  /** The flat, sorted track queue for the album (passed as-is to row/queue consumers). */
  readonly albumTracks: Track[];
  /** Disc-grouped render blocks (one block, no heading, for single-disc albums). */
  readonly discBlocks: readonly IAlbumDiscBlock[];
  /** Album display title. */
  readonly albumName: string;
  /** Album cover art URL, if any. */
  readonly albumArt: string | undefined;
  /** Composed "artist · year · genre" subtitle. */
  readonly headerMeta: string;
  /** Localized track-count label. */
  readonly trackCountLabel: string;
  /** Total album duration in seconds (0 hides the duration suffix). */
  readonly totalDuration: number;
  /** Formatted total duration suffix appended after the track count, if any. */
  readonly durationSuffix: string;
  /** Whether any track is selected — toggles the bulk action bar. */
  readonly hasSelection: boolean;
  /** Whether the play/shuffle actions are disabled (empty album). */
  readonly actionsDisabled: boolean;
  /** Currently playing track id/path for row highlighting. */
  readonly currentTrack: Track | null;
  /** Whether playback is active. */
  readonly isPlaying: boolean;
  /** Toggle a track's favorite flag. */
  readonly onToggleFavorite: (id: string) => void;
  /** Play a track by its flat queue index. */
  readonly onPlayTrack: (index: number) => void;
  /** Return to the album grid. */
  readonly onBack: () => void;
  /** Play the whole album from the top. */
  readonly onPlayAll: () => void;
  /** Shuffle-play the whole album. */
  readonly onShuffle: () => void;
}
