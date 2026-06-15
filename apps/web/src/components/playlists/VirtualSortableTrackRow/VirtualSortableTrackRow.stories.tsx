import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect, fn } from 'storybook/test';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Track } from '@/stores/types';

import VirtualSortableTrackRow from './VirtualSortableTrackRow';

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
 * playlists · VirtualSortableTrackRow. A single `react-window` row that is also a
 * dnd-kit sortable: a labelled drag handle plus the shared track row (a play
 * `<button>` named "title artist", with favorite / add / remove actions). The
 * "now playing" variant adds a sr-only "Now Playing" prefix to the row's name.
 * Stories wrap the row in a `SortableContext` and assert the row name + drag
 * handle for the idle and playing states.
 */
const meta: Meta<typeof VirtualSortableTrackRow> = {
  title: 'playlists/VirtualSortableTrackRow',
  component: VirtualSortableTrackRow,
  parameters: {
    // The play button is named by its text, and the drag handle / favorite / add
    // / remove icon buttons all carry aria-labels — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    index: 0,
    style: { position: 'relative', height: 48 },
    tracks: [track],
    currentTrack: null,
    isPlaying: false,
    onPlayTrack: fn(),
    onToggleFavorite: fn(),
    onRemoveTrack: fn(),
  },
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <DndContext>
          <SortableContext items={[track.id]} strategy={verticalListSortingStrategy}>
            <Story />
          </SortableContext>
        </DndContext>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VirtualSortableTrackRow>;

/** Idle row — the play button and the labelled drag handle. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The dnd-kit sortable wrapper is itself a `role="button"` whose computed
    // name echoes the row text, so two elements match the name — target the real
    // play control, the only true <button> among them.
    const playButton = canvas
      .getAllByRole('button', { name: /Midnight study session\s+Lofi Girl/ })
      .find(el => el.tagName === 'BUTTON');
    await expect(playButton).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Drag to reorder' })).toBeInTheDocument();
  },
};

/** Now-playing row — the accessible name gains a "Now Playing" prefix. */
export const Playing: Story = {
  args: {
    currentTrack: track,
    isPlaying: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Same wrapper/button name collision as the idle story, now with the sr-only
    // "Now Playing" prefix — assert the real play <button> carries it.
    const playButton = canvas
      .getAllByRole('button', { name: /Now Playing\s+Midnight study session/ })
      .find(el => el.tagName === 'BUTTON');
    await expect(playButton).toBeInTheDocument();
  },
};
