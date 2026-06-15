import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import KanjiVisualizer from './KanjiVisualizer';
import { createSyntheticSource } from '../visualizerStorySource';
/**
 * player · KanjiVisualizer. Kanji-rain — columns of falling glyphs with a
 * fading trail, each column's speed and brightness reacting to its frequency
 * band. Renders a single decorative `<canvas>` (no role, no text) that animates
 * from a `FrequencySource` via a frame-rate-capped rAF loop. With no source and
 * no playback analyser the loop idles before drawing but the canvas still
 * mounts; a synthetic source drives the real draw path.
 */
const meta: Meta<typeof KanjiVisualizer> = {
  title: 'player/KanjiVisualizer',
  component: KanjiVisualizer,
  // a11y ratcheted to 'error': the component renders a lone <canvas> with no
  // role and no accessible name (the glyphs are painted into the canvas bitmap,
  // not real DOM text), which is axe-clean — nothing to flag in the a11y tree.
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

type Story = StoryObj<typeof KanjiVisualizer>;

/**
 * Idle — active with no source and no playback analyser, so the rAF prelude
 * returns before drawing. The decorative canvas still mounts into the DOM.
 */
export const Idle: Story = {
  render: () => <KanjiVisualizer active />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
  },
};

/**
 * Active — fed a deterministic synthetic source so the real per-frame glyph
 * column draw executes against a live 2D context. The canvas mounts and fills
 * its wrapper.
 */
export const Active: Story = {
  render: () => <KanjiVisualizer active source={createSyntheticSource()} />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    await expect(canvas).toBeInTheDocument();
    await expect(canvas).toBeVisible();
  },
};
