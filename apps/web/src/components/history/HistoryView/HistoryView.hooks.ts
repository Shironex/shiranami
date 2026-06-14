import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock3, Music, PlayCircle } from 'lucide-react';
import { useListeningHistoryView } from '@/hooks/useListeningHistoryView';
import { formatTotalTime, getRangeCopy } from '@/components/history/historyUtils';
import type { IHistoryStat, IHistoryViewView } from './HistoryView.types';

export function useHistoryView(): IHistoryViewView {
  const { t } = useTranslation('history');
  const { t: tCommon } = useTranslation('common');
  const {
    selectedRange,
    setSelectedRange,
    summary,
    recent,
    activitySeries,
    isLoading,
    isError,
    refetch,
    handlePlayTrack,
  } = useListeningHistoryView();

  const rangeCopy = getRangeCopy(selectedRange);

  const stats: IHistoryStat[] = [
    {
      key: 'loggedPlays',
      label: t('loggedPlays'),
      value: summary.totalPlays.toLocaleString(),
      hint: t('meaningfulListens', { range: rangeCopy }),
      icon: PlayCircle,
    },
    {
      key: 'listeningTime',
      label: t('listeningTime'),
      value: formatTotalTime(summary.totalMinutes),
      hint: t('cumulativePlayback'),
      icon: Clock3,
    },
    {
      key: 'uniqueTracks',
      label: t('uniqueTracks'),
      value: summary.uniqueTracks.toLocaleString(),
      hint: t('uniqueTracksHint'),
      icon: Music,
    },
    {
      key: 'completedPlays',
      label: t('completedPlays'),
      value: summary.completedPlays.toLocaleString(),
      hint: t('completedPlaysHint'),
      icon: CheckCircle2,
    },
  ];

  return {
    isError,
    isLoading,
    errorTitle: t('errorTitle'),
    errorSubtitle: t('errorSubtitle'),
    retryLabel: tCommon('retry'),
    onRetry: () => {
      void refetch();
    },

    selectedRange,
    onRangeChange: setSelectedRange,

    stats,

    activityTitle: t('activity'),
    activityCaption: t('dailyListens', { range: rangeCopy.toLowerCase() }),
    activitySeries,

    topTracksTitle: t('topTracks'),
    topTracks: summary.topTracks,
    noTopTracksTitle: t('noTopTracksTitle'),
    noTopTracksCopy: t('noTopTracksCopy'),

    topArtistsTitle: t('topArtists'),
    topArtists: summary.topArtists,
    noArtistTrendsTitle: t('noArtistTrendsTitle'),
    noArtistTrendsCopy: t('noArtistTrendsCopy'),

    recentTitle: t('recentPlays'),
    recent,
    noRecentPlaysTitle: t('noRecentPlaysTitle'),
    noRecentPlaysCopy: t('noRecentPlaysCopy'),

    onPlayTrack: handlePlayTrack,
  };
}
