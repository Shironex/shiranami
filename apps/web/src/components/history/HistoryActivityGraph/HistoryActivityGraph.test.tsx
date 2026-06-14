import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ListeningActivityPoint } from '@/types/electron';

import HistoryActivityGraph from './HistoryActivityGraph';

function makePoint(overrides: Partial<ListeningActivityPoint> = {}): ListeningActivityPoint {
  return {
    date: '2026-06-10',
    playCount: 4,
    listenedMinutes: 12,
    ...overrides,
  };
}

describe('HistoryActivityGraph', () => {
  it('renders the empty state when there are no points', () => {
    render(<HistoryActivityGraph points={[]} range="7d" />);

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('renders the graph with an accessible label summarizing the window', () => {
    render(
      <HistoryActivityGraph
        points={[makePoint({ date: '2026-06-09', playCount: 2 }), makePoint({ playCount: 3 })]}
        range="7d"
      />
    );

    expect(
      screen.getByRole('img', { name: 'Listening activity: 5 plays over 2 days' })
    ).toBeInTheDocument();
  });

  it('labels each bar with its date, play count, and minutes', () => {
    const { container } = render(
      <HistoryActivityGraph
        points={[makePoint({ playCount: 4, listenedMinutes: 12 })]}
        range="7d"
      />
    );

    const bar = container.querySelector('[title]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('title')).toMatch(/4 plays, 12m listened/);
  });
});
