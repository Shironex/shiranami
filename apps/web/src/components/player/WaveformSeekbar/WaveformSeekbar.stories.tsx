import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';

import { WaveformSeekbar } from './index';

function makeTrack(): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
  };
}

/** Seed the playback position the waveform paints from (peaks fall back to a
 *  flat bar without the native bridge). */
function seedWaveform(currentTime: number): void {
  usePlaybackStore.setState({
    currentTrack: makeTrack(),
    currentTime,
    duration: 215,
    isPlaying: false,
  });
  usePlayerUIStore.setState({ scrubTime: null });
}

/**
 * player · WaveformSeekbar. The native-peaks variant of the scrubber — same
 * `role="slider"` contract as SeekBar (aria-valuemin/max/now + valuetext, full
 * keyboard operability) but it paints per-track waveform peaks to a canvas. The
 * peaks are decoded in the Electron main process; in the browser run there is no
 * native bridge, so it draws a flat bar and stays a functional scrubber. Reads
 * `usePlaybackStore` + `usePlayerUIStore`. Stories seed those and assert the
 * slider's accessible name + reported position.
 */
const meta: Meta<typeof WaveformSeekbar> = {
  title: 'player/WaveformSeekbar',
  component: WaveformSeekbar,
  parameters: {
    // The slider role lands on the labelled wrapper ("Seek"); the canvas is
    // decorative, so axe's aria-input-field-name rule passes.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-96 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WaveformSeekbar>;

/** Compact — the default-height waveform reports its playhead position. */
export const Compact: Story = {
  decorators: [
    Story => {
      seedWaveform(90);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = canvas.getByRole('slider', { name: 'Seek' });
    await expect(slider).toHaveAttribute('aria-valuenow', '90');
    await expect(slider).toHaveAttribute('aria-valuemax', '215');
    await expect(slider).toHaveAttribute('aria-valuetext', '1:30 of 3:35');
  },
};

/** Tall — a larger canvas height; the same slider contract holds. */
export const Tall: Story = {
  args: { canvasClassName: 'h-16' },
  decorators: [
    Story => {
      seedWaveform(90);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('slider', { name: 'Seek' })).toHaveAttribute(
      'aria-valuenow',
      '90'
    );
  },
};
