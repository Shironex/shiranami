import { useTranslation } from 'react-i18next';
import type { ListeningStatsSummary } from '@/types/electron';
import { StatTile, type StatTrendDirection } from '@/components/overview/StatTile';
import { formatHoursMinutes, formatTrendDelta } from '@/components/overview/overviewUtils';

interface StatStripProps {
  summary: ListeningStatsSummary;
  newInLibraryCount: number;
  /** Week-over-week minute delta (phase 5). `undefined` → no comparison line. */
  trendDeltaMinutes?: number;
  /** Gap-based session count for the last 7 days (phase 5). */
  sessionCount?: number;
}

/** "14h 32m" with the unit letters rendered smaller, matching the mockup. */
function HoursMinutes({ minutes }: { minutes: number }) {
  const { t } = useTranslation('overview');
  const { hours, minutes: mins } = formatHoursMinutes(minutes);
  if (hours === 0) {
    return (
      <>
        {mins}
        <span className="ml-0.5 text-base text-muted-foreground/70">{t('minutesUnit')}</span>
      </>
    );
  }
  return (
    <>
      {hours}
      <span className="ml-0.5 text-base text-muted-foreground/70">{t('hoursUnit')}</span> {mins}
      <span className="ml-0.5 text-base text-muted-foreground/70">{t('minutesUnit')}</span>
    </>
  );
}

export function StatStrip({
  summary,
  newInLibraryCount,
  trendDeltaMinutes,
  sessionCount,
}: StatStripProps) {
  const { t } = useTranslation('overview');

  const topArtist = summary.topArtists[0];

  const trend = trendDeltaMinutes !== undefined ? formatTrendDelta(trendDeltaMinutes) : null;
  const trendHint: { hint: string; dir: StatTrendDirection } =
    trendDeltaMinutes === undefined
      ? { hint: t('stats.trendNoComparison'), dir: 'neutral' }
      : trend === null
        ? { hint: t('stats.trendSame'), dir: 'neutral' }
        : {
            hint: t('stats.trendVsLastWeek', { delta: trend.label }),
            dir: trend.sign > 0 ? 'up' : 'down',
          };

  const tracksHint =
    sessionCount !== undefined && sessionCount > 0
      ? t('stats.acrossSessions', { count: sessionCount })
      : undefined;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        kanji="時"
        value={<HoursMinutes minutes={summary.totalMinutes} />}
        label={t('stats.listenedThisWeek')}
        hint={trendHint.hint}
        trend={trendHint.dir}
      />
      <StatTile
        kanji="曲"
        value={summary.totalPlays.toLocaleString()}
        label={t('stats.tracksPlayed')}
        hint={tracksHint}
      />
      <StatTile
        kanji="人"
        value={topArtist?.artist || t('stats.noArtist')}
        label={t('stats.topArtist')}
        hint={topArtist ? t('stats.artistPlays', { plays: topArtist.playCount }) : undefined}
      />
      <StatTile
        kanji="新"
        value={newInLibraryCount > 0 ? `+${newInLibraryCount}` : '0'}
        label={t('stats.newInLibrary')}
        hint={
          newInLibraryCount > 0
            ? t('stats.newInLibraryHint', { count: newInLibraryCount })
            : undefined
        }
      />
    </section>
  );
}
