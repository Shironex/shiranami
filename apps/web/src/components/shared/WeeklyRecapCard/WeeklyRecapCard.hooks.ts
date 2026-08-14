import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { pad2 } from '@shiranami/shared';
import { formatListeningDuration } from '@/lib/listeningDuration';
import type { IWeeklyRecapCardProps, IWeeklyRecapCardView } from './WeeklyRecapCard.types';

/**
 * Narrates a derived recap as a handful of prose lines — numbers become
 * sentences ("6 hours and 40 minutes across 11 sittings"), never badges, and a
 * line that isn't true this week (no repeated track, no clear peak) simply
 * doesn't appear rather than apologising for itself.
 */
export function useWeeklyRecapCard({
  recap,
  weekLabel,
}: IWeeklyRecapCardProps): IWeeklyRecapCardView {
  const { t } = useTranslation('overview');
  const headingId = useId();

  const lines = useMemo<string[]>(() => {
    const built: string[] = [];

    built.push(
      t('recap.time', {
        duration: formatListeningDuration(recap.totalMinutes),
        count: recap.sessionCount,
      })
    );

    // "Kept coming back" needs actual returning — a single play is not a habit.
    if (recap.topTrack && recap.topTrack.playCount >= 2) {
      built.push(
        t('recap.track', { title: recap.topTrack.title, count: recap.topTrack.playCount })
      );
    }

    if (recap.loudestHour !== null) {
      built.push(t('recap.loudest', { hour: `${pad2(recap.loudestHour)}:00` }));
    }

    return built;
  }, [recap, t]);

  return {
    headingId,
    title: t('recap.title'),
    titleEm: t('recap.titleEm'),
    weekLabel,
    lines,
    archiveLabel: t('recap.archiveAction'),
  };
}
