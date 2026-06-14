import { formatDuration } from '@shiranami/shared';
import { formatPlayedAt } from '@/components/history/historyUtils';
import type { IHistoryRecentRowProps, IHistoryRecentRowView } from './HistoryRecentRow.types';

export function useHistoryRecentRow({
  entry,
  onPlay,
}: IHistoryRecentRowProps): IHistoryRecentRowView {
  return {
    entry,
    subtitle: `${entry.artist} / ${entry.album}`,
    playedDuration: formatDuration(entry.playedSeconds),
    playedAt: formatPlayedAt(entry.playedAt),
    onPlay: () => onPlay(entry.trackId),
  };
}
