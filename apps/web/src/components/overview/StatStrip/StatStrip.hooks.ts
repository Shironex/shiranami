import { useTranslation } from 'react-i18next';
import { formatTrendDelta } from '../overviewUtils';
import type { StatTrendDirection } from '../StatTile';
import type { IStatStripProps, IStatStripView } from './StatStrip.types';

export function useStatStrip({
  summary,
  newInLibraryCount,
  trendDeltaMinutes,
  sessionCount,
}: IStatStripProps): IStatStripView {
  const { t } = useTranslation('overview');

  const topArtist = summary.topArtists[0];
  const trend = trendDeltaMinutes !== undefined ? formatTrendDelta(trendDeltaMinutes) : null;

  let trendHint: string;
  let trendDir: StatTrendDirection;
  if (trendDeltaMinutes === undefined) {
    trendHint = t('stats.trendNoComparison');
    trendDir = 'neutral';
  } else if (trend === null) {
    trendHint = t('stats.trendSame');
    trendDir = 'neutral';
  } else {
    trendHint = t('stats.trendVsLastWeek', { delta: trend.label });
    trendDir = trend.sign > 0 ? 'up' : 'down';
  }

  const tracksHint =
    sessionCount !== undefined && sessionCount > 0
      ? t('stats.acrossSessions', { count: sessionCount })
      : undefined;

  return {
    totalMinutes: summary.totalMinutes,
    labels: {
      listenedThisWeek: t('stats.listenedThisWeek'),
      tracksPlayed: t('stats.tracksPlayed'),
      topArtist: t('stats.topArtist'),
      newInLibrary: t('stats.newInLibrary'),
    },
    trendHint,
    trendDir,
    tracksPlayed: summary.totalPlays.toLocaleString(),
    tracksHint,
    topArtistValue: topArtist?.artist || t('stats.noArtist'),
    topArtistHint: topArtist ? t('stats.artistPlays', { plays: topArtist.playCount }) : undefined,
    newInLibraryValue: newInLibraryCount > 0 ? `+${newInLibraryCount}` : '0',
    newInLibraryHint:
      newInLibraryCount > 0 ? t('stats.newInLibraryHint', { count: newInLibraryCount }) : undefined,
  };
}
