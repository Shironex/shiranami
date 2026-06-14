import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningActivityPoint } from '@/types/electron';

import HistoryActivityGraph from './HistoryActivityGraph';

/** Build a contiguous run of daily activity points ending today. */
function makeSeries(days: number): ListeningActivityPoint[] {
  const today = new Date('2026-06-14T00:00:00.000Z');
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - index));
    const playCount = (index * 7) % 11;
    return {
      date: date.toISOString().slice(0, 10),
      playCount,
      listenedMinutes: playCount * 3.5,
    };
  });
}

const meta: Meta<typeof HistoryActivityGraph> = {
  title: 'history/HistoryActivityGraph',
  component: HistoryActivityGraph,
  decorators: [
    Story => (
      <div className="w-[40rem] rounded-[24px] border border-border/25 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryActivityGraph>;

export const Default: Story = {
  args: {
    range: '7d',
    points: makeSeries(7),
  },
};

export const ThirtyDays: Story = {
  args: {
    range: '30d',
    points: makeSeries(30),
  },
};

export const Empty: Story = {
  args: {
    range: '7d',
    points: [],
  },
};
