import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import { VolumeControl } from './index';

/** Seed the playback volume/mute the control reflects. */
function seedVolume(volume: number, isMuted: boolean): void {
  usePlaybackStore.setState({ volume, isMuted });
}

/**
 * player · VolumeControl. A mute toggle plus a 0–1 Radix volume slider, both
 * reading `usePlaybackStore`. The icon-only mute button carries an aria-label
 * that flips between "Mute" and "Unmute"; the slider's "Volume" name is
 * forwarded onto the Radix thumb (the `role="slider"` element) by the shared
 * ui/slider, so it has an accessible name. Stories seed the store, assert the
 * slider + button by role/name, and toggle mute to confirm the label swap.
 */
const meta: Meta<typeof VolumeControl> = {
  title: 'player/VolumeControl',
  component: VolumeControl,
  parameters: {
    // The mute button is labelled and the slider thumb carries the forwarded
    // "Volume" name, so axe's aria-input-field-name rule is satisfied.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VolumeControl>;

/** High volume — the slider sits near max and the button offers Mute. */
export const High: Story = {
  decorators: [
    Story => {
      seedVolume(0.8, false);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Radix puts role="slider" on the thumb; the shared ui/slider forwards the
    // "Volume" aria-label onto it, so it resolves by accessible name.
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();

    const muteButton = canvas.getByRole('button', { name: 'Mute' });
    await userEvent.click(muteButton);
    // Muting flips the icon-only button's accessible name to Unmute.
    await expect(canvas.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  },
};

/** Low volume — the slider reflects a quieter level; the button still reads Mute. */
export const Low: Story = {
  decorators: [
    Story => {
      seedVolume(0.25, false);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
  },
};

/** Muted — the button offers Unmute and the slider snaps to zero. */
export const Muted: Story = {
  decorators: [
    Story => {
      seedVolume(0.6, true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
    // While muted the slider value reads 0 regardless of the stored volume.
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  },
};
