import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';

import RecentlyAdded from './RecentlyAdded';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/drift.mp3',
    createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    ...overrides,
  };
}

const tracks: Track[] = [
  makeTrack({ id: 't1', title: 'Drift' }),
  makeTrack({
    id: 't2',
    title: 'Afterglow',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  }),
  makeTrack({
    id: 't3',
    title: 'Intro',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }),
];

const meta: Meta<typeof RecentlyAdded> = {
  title: 'overview/RecentlyAdded',
  component: RecentlyAdded,
  args: { onPlay: () => {} },
  decorators: [
    Story => (
      <div className="w-[40rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RecentlyAdded>;

export const Default: Story = {
  args: { tracks },
};
