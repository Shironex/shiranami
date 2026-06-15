import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';

import { SeekBar } from './index';

/** Seed the playback position the bar paints from (no live audio engine). */
function seedSeek(currentTime: number, duration: number, scrubTime: number | null): void {
  usePlaybackStore.setState({ currentTime, duration, isPlaying: false });
  usePlayerUIStore.setState({ scrubTime });
}

/**
 * player · SeekBar. The primary scrubber — a hand-rolled `role="slider"` element
 * (not Radix) so the fill + thumb can be driven by compositor-only transforms in
 * a rAF loop. It exposes aria-valuemin/max/now plus an aria-valuetext of
 * "<position> of <duration>", and is keyboard-operable (Arrows/Page/Home/End).
 * It reads `usePlaybackStore` for time/duration and `usePlayerUIStore` for the
 * in-progress scrub value. Stories seed those, then assert the slider's
 * accessible name + value.
 */
const meta: Meta<typeof SeekBar> = {
  title: 'player/SeekBar',
  component: SeekBar,
  parameters: {
    // The slider role lands directly on the labelled element ("Seek"), so the
    // aria-input-field-name rule is satisfied without a Radix thumb.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-80 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SeekBar>;

/** Midway — the slider reports the current position against the total duration. */
export const Midway: Story = {
  decorators: [
    Story => {
      seedSeek(108, 215, null);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = canvas.getByRole('slider', { name: 'Seek' });
    await expect(slider).toHaveAttribute('aria-valuenow', '108');
    await expect(slider).toHaveAttribute('aria-valuemax', '215');
    // valuetext renders the human-readable position the OS/screen-reader announces.
    await expect(slider).toHaveAttribute('aria-valuetext', '1:48 of 3:35');
  },
};

/** Start — position pinned to zero. */
export const Start: Story = {
  decorators: [
    Story => {
      seedSeek(0, 215, null);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('slider', { name: 'Seek' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  },
};

/** Scrubbing — the active scrub time overrides the playback time on the readout. */
export const Scrubbing: Story = {
  decorators: [
    Story => {
      seedSeek(108, 215, 60);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // scrubTime (60) wins over the stored currentTime (108) while dragging.
    await expect(canvas.getByRole('slider', { name: 'Seek' })).toHaveAttribute(
      'aria-valuenow',
      '60'
    );
  },
};
