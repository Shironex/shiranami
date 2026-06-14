import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningStatsTrack } from '@/types/electron';

import TopThisWeek from './TopThisWeek';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 2400,
    lastPlayedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

const tracks: ListeningStatsTrack[] = [
  makeTrack({ trackId: 't1', title: 'Drift', playCount: 18 }),
  makeTrack({ trackId: 't2', title: 'Afterglow', playCount: 11 }),
  makeTrack({ trackId: 't3', title: 'Intro', playCount: 6 }),
];

const meta: Meta<typeof TopThisWeek> = {
  title: 'overview/TopThisWeek',
  component: TopThisWeek,
  args: { onPlay: () => {}, onOpenLibrary: () => {} },
  decorators: [
    Story => (
      <div className="w-[34rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TopThisWeek>;

export const Default: Story = {
  args: { tracks },
};

export const Empty: Story = {
  args: { tracks: [] },
};
