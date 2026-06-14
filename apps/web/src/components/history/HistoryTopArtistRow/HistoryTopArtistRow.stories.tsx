import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningStatsArtist } from '@/types/electron';

import HistoryTopArtistRow from './HistoryTopArtistRow';

function makeArtist(overrides: Partial<ListeningStatsArtist> = {}): ListeningStatsArtist {
  return {
    artist: 'Lofi Collective',
    playCount: 28,
    listenedSeconds: 9000,
    ...overrides,
  };
}

const meta: Meta<typeof HistoryTopArtistRow> = {
  title: 'history/HistoryTopArtistRow',
  component: HistoryTopArtistRow,
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryTopArtistRow>;

export const Default: Story = {
  args: {
    artist: makeArtist(),
  },
};

export const Unknown: Story = {
  args: {
    artist: makeArtist({ artist: '' }),
  },
};
