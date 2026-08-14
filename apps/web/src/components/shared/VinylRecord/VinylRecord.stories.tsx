import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { useUIStore } from '@/stores/useUIStore';
import { createSyntheticSource } from '@/components/player/visualizerStorySource';
import VinylRecord from './VinylRecord';

/**
 * shared · VinylRecord. The spinning vinyl artwork display: a CSS-only disc
 * (grooves, wobble, static sheen) whose center label shows the album artwork
 * or the 白波 brand mark, plus an optional audio-reactive ring canvas driven
 * by a `FrequencySource`. The disc and ring are decorative (`aria-hidden`);
 * only the artwork label contributes an accessible image.
 */
const meta: Meta<typeof VinylRecord> = {
  title: 'shared/VinylRecord',
  component: VinylRecord,
  // Decorative disc layers are aria-hidden and the artwork label is a real
  // <img alt> — axe clean at the error level.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="size-[20rem] bg-background p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VinylRecord>;

/**
 * Glow ring + brand-mark label. With no artwork the label falls back to the
 * live-text 白波 mark; the synthetic source drives the halo draw path.
 */
export const BrandMarkGlow: Story = {
  render: () => {
    useUIStore.setState({ vinylLabelSource: 'logo', vinylRingStyle: 'glow' });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" source={createSyntheticSource()} />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="vinyl-record"]')).toBeInTheDocument();
    await expect(canvasElement.querySelector('.vinyl-label')).toHaveTextContent('白波');
    await expect(canvasElement.querySelector('canvas')).toBeInTheDocument();
  },
};

/**
 * Spectrum ring — ~56 radial bars around the rim, drawn from the same
 * synthetic source through the shared visualizer frame hook.
 */
export const SpectrumRing: Story = {
  render: () => {
    useUIStore.setState({ vinylLabelSource: 'logo', vinylRingStyle: 'spectrum' });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" source={createSyntheticSource()} />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('canvas')).toBeInTheDocument();
  },
};

/** Ring off — only the disc, sheen, and label render; no canvas mounts. */
export const RingOff: Story = {
  render: () => {
    useUIStore.setState({ vinylLabelSource: 'logo', vinylRingStyle: 'off' });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('canvas')).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('.vinyl-disc')).toBeInTheDocument();
  },
};
