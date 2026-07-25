import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import CrossfadePreview from './CrossfadePreview';

/**
 * settings · CrossfadePreview. The live preview for crossfade in Playback
 * settings: two stacked track bars, the outgoing one fixed and the incoming one
 * positioned by the toggle — blending slides it back under the outgoing track,
 * stretches it and adds a soft overlap glow, while a clean cut parks it at the
 * boundary as a hairline. The footer reports the transition and its length.
 */
const meta: Meta<typeof CrossfadePreview> = {
  title: 'settings/CrossfadePreview',
  component: CrossfadePreview,
  parameters: {
    // Plain text and decorative bars, no interactive controls — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CrossfadePreview>;

/** Crossfade on at 6s — the bars overlap and the blend glow shows. */
export const Blending: Story = {
  args: { enabled: true, duration: 6 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Tracks overlap smoothly')).toBeInTheDocument();
    await expect(canvas.getByText('6s overlap')).toBeInTheDocument();
    await expect(canvasElement.querySelector('.blur-sm')).not.toBeNull();
  },
};

/** A longer 12s crossfade — same geometry, the reported length follows the slider. */
export const LongOverlap: Story = {
  args: { enabled: true, duration: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('12s overlap')).toBeInTheDocument();
  },
};

/** Crossfade off — a hard cut at the boundary, no overlap and no glow. */
export const CleanCut: Story = {
  args: { enabled: false, duration: 6 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Next track starts after a clean cut')).toBeInTheDocument();
    await expect(canvas.getByText('0s')).toBeInTheDocument();
    await expect(canvasElement.querySelector('.blur-sm')).toBeNull();
  },
};
