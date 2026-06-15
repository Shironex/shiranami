import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import ParticleVisualizer from './ParticleVisualizer';
import { createSyntheticSource } from '../visualizerStorySource';
/**
 * player · ParticleVisualizer. A flowing bezier-curved frequency line with a
 * soft gradient fill underneath — calm and organic. Renders a single decorative
 * `<canvas>` (no role, no text) that animates from a `FrequencySource` via a
 * frame-rate-capped rAF loop. With no source and no playback analyser the loop
 * idles before drawing but the canvas still mounts; a synthetic source drives
 * the real draw path.
 */
const meta: Meta<typeof ParticleVisualizer> = {
  title: 'player/ParticleVisualizer',
  component: ParticleVisualizer,
  // a11y ratcheted to 'error': the component renders a lone <canvas> with no
  // role and no accessible name (purely decorative, pointer-events-none), which
  // is axe-clean — there is no text, contrast surface, or named-region to flag.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ParticleVisualizer>;

/**
 * Idle — active with no source and no playback analyser, so the rAF prelude
 * returns before drawing. The decorative canvas still mounts into the DOM.
 */
export const Idle: Story = {
  render: () => <ParticleVisualizer active />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
  },
};

/**
 * Active — fed a deterministic synthetic source so the real per-frame bezier
 * wave draw executes against a live 2D context. The canvas mounts and fills its
 * wrapper.
 */
export const Active: Story = {
  render: () => <ParticleVisualizer active source={createSyntheticSource()} />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
    await expect(canvas).toBeVisible();
  },
};
