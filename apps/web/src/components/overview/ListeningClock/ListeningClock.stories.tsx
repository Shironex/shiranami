import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningHourlyActivityPoint } from '@/types/electron';
import { buildHeatmap } from '../overviewUtils';

import ListeningClock from './ListeningClock';

const points: ListeningHourlyActivityPoint[] = [
  { dayOfWeek: 1, hour: 22, playCount: 6, listenedMinutes: 18 },
  { dayOfWeek: 2, hour: 23, playCount: 4, listenedMinutes: 12 },
  { dayOfWeek: 3, hour: 9, playCount: 2, listenedMinutes: 6 },
  { dayOfWeek: 5, hour: 21, playCount: 9, listenedMinutes: 27 },
];

const meta: Meta<typeof ListeningClock> = {
  title: 'overview/ListeningClock',
  component: ListeningClock,
  decorators: [
    Story => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ListeningClock>;

export const Default: Story = {
  args: {
    heatmap: buildHeatmap(points),
  },
};

export const Empty: Story = {
  args: {
    heatmap: buildHeatmap([]),
  },
};
