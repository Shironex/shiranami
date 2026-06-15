import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import QueuePanel from './QueuePanel';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Girl',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const queue: Track[] = [
  makeTrack({ id: 'q0', title: 'Current track', artist: 'Idealism' }),
  makeTrack({ id: 'q1', title: 'Up next one', artist: 'Tide' }),
  makeTrack({ id: 'q2', title: 'Up next two', artist: 'Aso' }),
  makeTrack({ id: 'q3', title: 'Up next three', artist: 'Kupla' }),
];

function seedQueue(tracks: Track[], index: number): void {
  usePlaybackStore.setState({
    queue: tracks,
    queueIndex: index,
    currentTrack: tracks[index] ?? null,
    isPlaying: index >= 0,
  });
}

/**
 * player · QueuePanel. The play queue — a "Queue" heading with a Clear action, a
 * "Now Playing" row, and a drag-reorderable "Up Next" list, all reading
 * `usePlaybackStore`. Each row shows the track title/artist plus a remove button
 * ("Remove from queue") and a drag handle ("Drag to reorder"); the active row
 * carries an sr-only "Now Playing" label. With an empty queue it shows the
 * "Queue is empty" placeholder. Stories seed the queue and assert the structure
 * by role + name.
 */
const meta: Meta<typeof QueuePanel> = {
  title: 'player/QueuePanel',
  component: QueuePanel,
  parameters: {
    // The heading is semantic, the clear/remove/drag controls are all labelled,
    // and the now-playing row has an sr-only name — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-80 flex-col glass border border-border/30 rounded-2xl overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof QueuePanel>;

/** With queue — the now-playing track plus three reorderable up-next rows. */
export const WithQueue: Story = {
  decorators: [
    Story => {
      seedQueue(queue, 0);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Queue' })).toBeInTheDocument();
    // The now-playing track plus the three up-next titles all render.
    await expect(canvas.getByText('Current track')).toBeInTheDocument();
    await expect(canvas.getByText('Up next one')).toBeInTheDocument();

    // Each interactive row exposes a labelled remove control; the three up-next
    // rows plus the now-playing row give four.
    await expect(canvas.getAllByRole('button', { name: 'Remove from queue' })).toHaveLength(4);
    // The three sortable up-next rows each carry a drag handle.
    await expect(canvas.getAllByRole('button', { name: 'Drag to reorder' })).toHaveLength(3);
  },
};

/** Empty — the placeholder replaces the rows. */
export const Empty: Story = {
  decorators: [
    Story => {
      seedQueue([], -1);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Queue is empty')).toBeInTheDocument();
    // No Clear action when there is nothing to clear.
    await expect(canvas.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  },
};
