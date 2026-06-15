import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Track } from '@/stores/types';

import SortableQueueRow, { QueueItem, DragOverlayContent } from './QueueRow';

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

const track = makeTrack();

/**
 * player · QueueRow. The queue list rows, in three forms: the draggable "Up Next"
 * row (default export, wrapped in dnd-kit context), the non-draggable "Now
 * Playing" `QueueItem`, and the `DragOverlayContent` shown while dragging. Each
 * interactive row renders the track title/artist plus a remove button ("Remove
 * from queue") and — for the sortable row — a drag handle ("Drag to reorder"),
 * with labels pulled from the `queue` i18n namespace. Clicking the row plays it;
 * clicking remove removes it. Stories drive the `onPlay`/`onRemove` spies.
 */
const meta: Meta<typeof SortableQueueRow> = {
  title: 'player/QueueRow',
  component: SortableQueueRow,
  parameters: {
    // The remove button and drag handle are icon-only but labelled from i18n —
    // axe passes clean for every row form.
    a11y: { test: 'error' },
  },
  args: {
    track,
    sortableId: 'queue-1',
    queueIndex: 1,
    onPlay: fn(),
    onRemove: fn(),
  },
  decorators: [
    Story => (
      <div className="w-80 p-4">
        <DndContext>
          <SortableContext items={['queue-1']} strategy={verticalListSortingStrategy}>
            <Story />
          </SortableContext>
        </DndContext>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SortableQueueRow>;

/** Sortable up-next row — clicking it plays; the remove button fires its callback. */
export const Sortable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Midnight study session')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Drag to reorder' })).toBeInTheDocument();

    // Remove stops propagation and calls onRemove with the queue index (1).
    await userEvent.click(canvas.getByRole('button', { name: 'Remove from queue' }));
    await expect(args.onRemove).toHaveBeenCalled();
  },
};

/** Now Playing — the active, non-draggable row with an sr-only status label. */
export const NowPlaying: StoryObj<typeof QueueItem> = {
  render: () => {
    const onPlay = fn();
    const onRemove = fn();
    return (
      <div className="w-80 p-4">
        <QueueItem track={track} index={0} isActive isPlaying onPlay={onPlay} onRemove={onRemove} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The active+playing row announces "Now Playing" to screen readers.
    await expect(canvas.getByText('Now Playing')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Remove from queue' })).toBeInTheDocument();
  },
};

/** Overlay — the floating preview rendered under the cursor while dragging. */
export const Overlay: StoryObj<typeof DragOverlayContent> = {
  render: () => (
    <div className="w-80 p-4">
      <DragOverlayContent track={track} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The overlay is a static, non-interactive preview of the row content.
    await expect(canvas.getByText('Midnight study session')).toBeInTheDocument();
  },
};
