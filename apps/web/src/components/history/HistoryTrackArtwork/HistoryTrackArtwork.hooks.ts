import type {
  IHistoryTrackArtworkProps,
  IHistoryTrackArtworkView,
} from './HistoryTrackArtwork.types';

export function useHistoryTrackArtwork({
  albumArt,
  title,
}: IHistoryTrackArtworkProps): IHistoryTrackArtworkView {
  return { albumArt, title };
}
