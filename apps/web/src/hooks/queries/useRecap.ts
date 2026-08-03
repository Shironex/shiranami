import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import { buildHeatmap } from '@/components/overview/overviewUtils';
import type { WeekWindow } from '@/lib/recap';

/** One derived weekly recap — tasteful numbers only, prose happens in the card. */
export interface WeeklyRecap {
  /** Week identity (`YYYY-MM-DD` of its Monday). */
  weekKey: string;
  totalPlays: number;
  totalMinutes: number;
  /** Gap-based sittings, from the weekly-insights read. */
  sessionCount: number;
  /** The most-returned-to track of the week, or null for a quiet week. */
  topTrack: { title: string; playCount: number } | null;
  /** Hour-of-day (0–23) with the most plays, or null with no clear peak. */
  loudestHour: number | null;
}

export const recapKeys = {
  week: (weekKey: string) => ['history', 'recap', weekKey] as const,
};

/**
 * Derive one completed week's recap from the three history reads, windowed
 * with the closed `[start, end)` bounds (`until` exclusive — the reason the
 * activity channels grew the bind). A finished week's history never changes,
 * so the result is cached forever: browsing the archive re-derives each week
 * once per session at most.
 */
export function useWeeklyRecapQuery(week: WeekWindow | null) {
  return useQuery({
    queryKey: recapKeys.week(week?.key ?? 'none'),
    enabled: IS_ELECTRON && week !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<WeeklyRecap> => {
      if (!week) throw new Error('recap query ran without a window');
      const since = week.start.toISOString();
      const until = week.end.toISOString();

      const [summary, hourly, insights] = await Promise.all([
        window.electronAPI.db.history.getSummary({ since, until }),
        window.electronAPI.db.history.getHourlyActivity({ since, until }),
        window.electronAPI.db.history.getWeeklyInsights({ since, until }),
      ]);

      const topTrack = summary.topTracks[0] ?? null;

      return {
        weekKey: week.key,
        totalPlays: summary.totalPlays,
        totalMinutes: summary.totalMinutes,
        sessionCount: insights.sessionCount,
        topTrack: topTrack ? { title: topTrack.title, playCount: topTrack.playCount } : null,
        loudestHour: buildHeatmap(hourly).peakHour,
      };
    },
  });
}
