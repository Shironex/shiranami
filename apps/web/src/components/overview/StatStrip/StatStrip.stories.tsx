import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningStatsSummary } from '@/types/electron';

import StatStrip from './StatStrip';

const summary: ListeningStatsSummary = {
  totalPlays: 128,
  totalMinutes: 872,
  uniqueTracks: 64,
  uniqueArtists: 22,
  completedPlays: 110,
  topTracks: [],
  topArtists: [{ artist: 'Idealism', playCount: 41, listenedSeconds: 9000 }],
};

const meta: Meta<typeof StatStrip> = {
  title: 'overview/StatStrip',
  component: StatStrip,
  decorators: [
    Story => (
      <div className="w-[56rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatStrip>;

export const Default: Story = {
  args: {
    summary,
    newInLibraryCount: 3,
    trendDeltaMinutes: 138,
    sessionCount: 5,
  },
};

export const NoComparison: Story = {
  args: {
    summary,
    newInLibraryCount: 0,
    trendDeltaMinutes: undefined,
    sessionCount: 0,
  },
};
