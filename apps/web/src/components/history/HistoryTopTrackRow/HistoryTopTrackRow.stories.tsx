import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningStatsTrack } from '@/types/electron';

import HistoryTopTrackRow from './HistoryTopTrackRow';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 4200,
    lastPlayedAt: new Date('2026-06-14T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

const meta: Meta<typeof HistoryTopTrackRow> = {
  title: 'history/HistoryTopTrackRow',
  component: HistoryTopTrackRow,
  args: {
    onPlay: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryTopTrackRow>;

export const Default: Story = {
  args: {
    track: makeTrack(),
  },
};
