import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import LiquidVisualizer from './LiquidVisualizer';
import { createSyntheticSource } from '../visualizerStorySource';
/**
 * player · LiquidVisualizer. A soft metaball blob whose vertices wobble with
 * audio and a slow morph, wrapped in a glowing halo. Renders a single
 * decorative `<canvas>` (no role, no text) that animates from a
 * `FrequencySource` via a frame-rate-capped rAF loop. With no source and no
 * playback analyser the loop idles before drawing but the canvas still mounts;
 * a synthetic source drives the real draw path.
 */
const meta: Meta<typeof LiquidVisualizer> = {
  title: 'player/LiquidVisualizer',
  component: LiquidVisualizer,
  // a11y ratcheted to 'error': the component renders a lone <canvas> with no
  // role and no accessible name (purely decorative, pointer-events-none), which
  // is axe-clean — there is no text, contrast surface, or named-region to flag.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LiquidVisualizer>;

/**
 * Idle — active with no source and no playback analyser, so the rAF prelude
 * returns before drawing. The decorative canvas still mounts into the DOM.
 */
export const Idle: Story = {
  render: () => <LiquidVisualizer active />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
  },
};

/**
 * Active — fed a deterministic synthetic source so the real per-frame blob +
 * halo draw executes against a live 2D context. The canvas mounts and fills its
 * wrapper.
 */
export const Active: Story = {
  render: () => <LiquidVisualizer active source={createSyntheticSource()} />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
    await expect(canvas).toBeVisible();
  },
};
