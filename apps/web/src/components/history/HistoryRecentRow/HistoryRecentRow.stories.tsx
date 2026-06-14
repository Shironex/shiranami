import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningHistoryEntry } from '@/types/electron';

import HistoryRecentRow from './HistoryRecentRow';

function makeEntry(overrides: Partial<ListeningHistoryEntry> = {}): ListeningHistoryEntry {
  return {
    id: 'entry-1',
    trackId: 'track-1',
    title: 'Rainy day cafe',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    duration: 198,
    playedAt: new Date('2026-06-14T09:30:00.000Z').toISOString(),
    playedSeconds: 198,
    completionRatio: 1,
    completed: true,
    source: 'library',
    ...overrides,
  };
}

const meta: Meta<typeof HistoryRecentRow> = {
  title: 'history/HistoryRecentRow',
  component: HistoryRecentRow,
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

type Story = StoryObj<typeof HistoryRecentRow>;

export const Default: Story = {
  args: {
    entry: makeEntry(),
  },
};
