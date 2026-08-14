import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import { useUIStore } from '@/stores/useUIStore';
import RoomLightPreview from './RoomLightPreview';

/**
 * settings · RoomLightPreview. The live preview for the room-light grade in
 * Visual effects settings: the real `.room-light` layer over a stand-in scene,
 * built by the same `roomLightLayerStyle` the ambient background uses, so the
 * sample is pixel-identical to what the app paints. The mock is exposed as a
 * labelled `role="img"`.
 */
const meta: Meta<typeof RoomLightPreview> = {
  title: 'settings/RoomLightPreview',
  component: RoomLightPreview,
  parameters: {
    // A single labelled role="img" over decorative layers plus one text line —
    // axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => {
      // Hold the night stop so the story shows the same grade at any hour.
      useUIStore.setState({
        roomLightStop: 'night',
        roomLightIntensity: 100,
        roomLightHueShift: 0,
      });
      return (
        <div className="max-w-[420px] p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof RoomLightPreview>;

/** Effect on — the night grade and its desk-lamp pool over the sample scene. */
export const Enabled: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Room light preview' })).toBeInTheDocument();
    await expect(
      canvasElement.querySelector('[data-slot="room-light-preview-layer"]')
    ).toBeInTheDocument();
  },
};

/** Effect off — the grade layer is unmounted, leaving the bare scene. */
export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Light off')).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-slot="room-light-preview-layer"]')).toBeNull();
  },
};
