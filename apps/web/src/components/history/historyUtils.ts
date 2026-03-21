import type { ListeningActivityPoint, ListeningStatsSummary } from '@/types/electron';

export type HistoryRange = '7d' | '30d' | 'all';

export const HISTORY_RANGES: Array<{ id: HistoryRange; label: string }> = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'all', label: 'All Time' },
];

export const EMPTY_SUMMARY: ListeningStatsSummary = {
  totalPlays: 0,
  totalMinutes: 0,
  uniqueTracks: 0,
  uniqueArtists: 0,
  completedPlays: 0,
  topTracks: [],
  topArtists: [],
};

export function getSinceForRange(range: HistoryRange): string | null {
  if (range === 'all') return null;

  const days = range === '7d' ? 7 : 30;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  return since.toISOString();
}

export function getRangeCopy(range: HistoryRange): string {
  if (range === '7d') return 'Last 7 days';
  if (range === '30d') return 'Last 30 days';
  return 'All time';
}

export function buildActivitySeries(
  range: HistoryRange,
  activity: ListeningActivityPoint[],
): ListeningActivityPoint[] {
  if (range === 'all' || activity.length === 0) {
    return activity;
  }

  const byDate = new Map(activity.map((point) => [point.date, point]));
  const days = range === '7d' ? 7 : 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series: ListeningActivityPoint[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    series.push(
      byDate.get(key) ?? {
        date: key,
        playCount: 0,
        listenedMinutes: 0,
      },
    );
  }

  return series;
}

export function formatTotalTime(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h`;
  }

  return `${Math.round(minutes)}m`;
}

export function formatListenTime(seconds: number): string {
  if (seconds >= 3600) {
    return `${(seconds / 3600).toFixed(1)}h listened`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)}m listened`;
  }
  return `${Math.max(1, Math.round(seconds))}s listened`;
}

export function formatPlayedAt(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatActivityLabel(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}
