import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ListeningHourlyActivityPoint } from '@/types/electron';
import { buildHeatmap } from '../overviewUtils';

import ListeningClock from './ListeningClock';

describe('ListeningClock', () => {
  it('shows the empty copy when there is no listening data', () => {
    render(<ListeningClock heatmap={buildHeatmap([])} />);

    expect(screen.getByText(/Your listening clock fills in/)).toBeInTheDocument();
  });

  it('renders the heatmap grid with an accessible label when data exists', () => {
    const points: ListeningHourlyActivityPoint[] = [
      { dayOfWeek: 1, hour: 22, playCount: 6, listenedMinutes: 18 },
      { dayOfWeek: 3, hour: 9, playCount: 2, listenedMinutes: 6 },
    ];
    render(<ListeningClock heatmap={buildHeatmap(points)} />);

    expect(screen.getByRole('img', { name: /Listening clock/ })).toBeInTheDocument();
  });

  it('labels the peak window when there is a clear peak', () => {
    const points: ListeningHourlyActivityPoint[] = [
      { dayOfWeek: 1, hour: 21, playCount: 8, listenedMinutes: 24 },
      { dayOfWeek: 2, hour: 21, playCount: 6, listenedMinutes: 18 },
    ];
    render(<ListeningClock heatmap={buildHeatmap(points)} />);

    expect(screen.getByText(/Loudest at 21:00/)).toBeInTheDocument();
  });
});
