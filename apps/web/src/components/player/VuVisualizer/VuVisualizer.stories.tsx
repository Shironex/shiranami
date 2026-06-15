import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import VuVisualizer from './VuVisualizer';
import type { FrequencySource } from '../visualizer-source';

/**
 * A deterministic, audio-free frequency source so a story can drive the real
 * per-frame draw path without the playback engine — two summed sine waves
 * tapered toward the high bins, mirroring the rough shape of real spectrum
 * data (same shape the settings preview uses).
 */
function createSyntheticSource(): FrequencySource {
  let t = 0;
  return {
    binCount: 256,
    read(buf) {
      t += 0.04;
      for (let i = 0; i < buf.length; i++) {
        const x = i / buf.length;
        const a = Math.sin(t + x * 7) * (1 - x);
        const b = Math.sin(t * 1.6 + x * 3.5 + 1.1) * (1 - x * 0.55);
        buf[i] = Math.max(0, Math.min(255, ((a + b) * 0.5 + 0.5) * 255 * 0.65));
      }
      return true;
    },
  };
}

/**
 * player · VuVisualizer. Twin analog VU needles (L/R) sweeping over a ticked
 * arc. Renders a single decorative `<canvas>` (no role, no text) that animates
 * from a `FrequencySource` via a frame-rate-capped rAF loop. With no source and
 * no playback analyser the loop idles before drawing but the canvas still
 * mounts; a synthetic source drives the real draw path.
 */
const meta: Meta<typeof VuVisualizer> = {
  title: 'player/VuVisualizer',
  component: VuVisualizer,
  // a11y ratcheted to 'error': the component renders a lone <canvas> with no
  // role and no accessible name (the meter face + tick labels are painted into
  // the canvas bitmap, not real DOM text), which is axe-clean — nothing to flag.
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

type Story = StoryObj<typeof VuVisualizer>;

/**
 * Idle — active with no source and no playback analyser, so the rAF prelude
 * returns before drawing. The decorative canvas still mounts into the DOM.
 */
export const Idle: Story = {
  render: () => <VuVisualizer active />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
  },
};

/**
 * Active — fed a deterministic synthetic source so the real per-frame needle +
 * bezel draw executes against a live 2D context. The canvas mounts and fills
 * its wrapper.
 */
export const Active: Story = {
  render: () => <VuVisualizer active source={createSyntheticSource()} />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
    await expect(canvas).toBeVisible();
  },
};
