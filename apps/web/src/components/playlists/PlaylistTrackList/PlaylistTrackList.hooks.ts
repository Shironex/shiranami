import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { IPlaylistTrackListProps, IPlaylistTrackListView } from './PlaylistTrackList.types';

export function usePlaylistTrackList(props: IPlaylistTrackListProps): IPlaylistTrackListView {
  const { displayTracks, currentTrack, isPlaying, onPlayTrack, onToggleFavorite, onRemoveTrack } =
    props;
  const { t } = useTranslation('playlists');

  // Row props are passed once to react-window; it re-renders rows when any of
  // these change. The row reads its own track via `index` from `tracks`.
  const rowProps = useMemo(
    () => ({
      tracks: displayTracks,
      currentTrack,
      isPlaying,
      onPlayTrack,
      onToggleFavorite,
      onRemoveTrack,
    }),
    [displayTracks, currentTrack, isPlaying, onPlayTrack, onToggleFavorite, onRemoveTrack]
  );

  return {
    t,
    isEmpty: displayTracks.length === 0,
    rowProps,
  };
}
