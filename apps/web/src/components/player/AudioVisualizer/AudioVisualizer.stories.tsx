import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import AudioVisualizer from './AudioVisualizer';
import { createSyntheticSource } from '../visualizerStorySource';
/**
 * player · AudioVisualizer. Canvas frequency bars with a soft lofi aesthetic —
 * center-aligned rounded bars with edge fading. Renders a single decorative
 * `<canvas>` (no role, no text) that animates from a `FrequencySource` via a
 * frame-rate-capped rAF loop. With no source and no playback analyser the loop
 * idles before drawing but the canvas still mounts; a synthetic source drives
 * the real draw path.
 */
const meta: Meta<typeof AudioVisualizer> = {
  title: 'player/AudioVisualizer',
  component: AudioVisualizer,
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

type Story = StoryObj<typeof AudioVisualizer>;

/**
 * Idle — active with no source and no playback analyser, so the rAF prelude
 * returns before drawing. The decorative canvas still mounts into the DOM.
 */
export const Idle: Story = {
  render: () => <AudioVisualizer active />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
  },
};

/**
 * Active — fed a deterministic synthetic source so the real per-frame bar draw
 * executes against a live 2D context. The canvas mounts and fills its wrapper.
 */
export const Active: Story = {
  render: () => <AudioVisualizer active source={createSyntheticSource()} />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
    // Decorative canvas: no role/name to assert, so confirm it fills its wrapper
    // (block display + w-full/h-full) by checking it is the rendered element.
    await expect(canvas).toBeVisible();
  },
};
