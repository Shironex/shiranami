import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RECAP_ARCHIVE_WEEKS, formatWeekRange, listCompletedWeeks } from '@/lib/recap';
import { useWeeklyRecapQuery } from '@/hooks/queries/useRecap';
import type { IRecapShelfView } from './RecapShelf.types';

/**
 * The archive is *derived*, never stored: the shelf lists the last few
 * completed weeks and recomputes the selected one's recap from `play_history`
 * on demand (cached forever — a finished week can't change). Only the selected
 * week is fetched, so browsing costs one closed-window read set per week
 * actually looked at.
 */
export function useRecapShelf(): IRecapShelfView {
  const { t, i18n } = useTranslation('history');

  // The week list is stable for the whole mounted life of the view — computing
  // it once per mount keeps the chips from shifting under a click at midnight.
  const [now] = useState(() => new Date());
  const windows = useMemo(() => listCompletedWeeks(now, RECAP_ARCHIVE_WEEKS), [now]);

  const [selectedKey, setSelectedKey] = useState(windows[0].key);
  const selected = windows.find(week => week.key === selectedKey) ?? windows[0];

  const { data, isLoading } = useWeeklyRecapQuery(selected);

  const weeks = useMemo(
    () =>
      windows.map(week => ({
        key: week.key,
        label: formatWeekRange(week, i18n.language),
        selected: week.key === selected.key,
      })),
    [windows, selected.key, i18n.language]
  );

  return {
    title: t('recaps.title'),
    caption: t('recaps.caption'),
    weeks,
    onSelectWeek: setSelectedKey,
    recap: data && data.totalPlays > 0 ? data : null,
    selectedLabel: formatWeekRange(selected, i18n.language),
    isLoading,
    quietWeekCopy: t('recaps.quietWeek'),
  };
}
