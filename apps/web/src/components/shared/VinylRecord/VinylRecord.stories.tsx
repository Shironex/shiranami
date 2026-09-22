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
    Story => {
      // Every story overrides only what it demonstrates; everything else must
      // come back to the defaults so story order can't bleed state.
      useUIStore.setState({
        vinylLabelSource: 'artwork',
        vinylRingStyle: 'glow',
        vinylSpeed: '33',
        vinylFinish: 'black',
        vinylTonearmEnabled: false,
      });
      return (
        <div className="size-[20rem] bg-background p-6">
          <Story />
        </div>
      );
    },
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

/** Self-contained cover for the picture-disc story — no network fetch. */
const STORY_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
      `<rect width="240" height="240" fill="%23342a56"/>` +
      `<circle cx="70" cy="80" r="60" fill="%239b7deb"/>` +
      `<circle cx="180" cy="170" r="80" fill="%23f09e60"/>` +
      `</svg>`
  );

/**
 * 45 RPM single — the RPM setting reaches the disc as a real revolution
 * duration through the `--vinyl-rev` custom property (60s / 45 ≈ 1.333s).
 */
export const Single45Rpm: Story = {
  render: () => {
    useUIStore.setState({ vinylLabelSource: 'logo', vinylRingStyle: 'off', vinylSpeed: '45' });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" />;
  },
  play: async ({ canvasElement }) => {
    const disc = canvasElement.querySelector<HTMLElement>('.vinyl-disc');
    await expect(disc!.style.getPropertyValue('--vinyl-rev')).toBe('1.333s');
  },
};

/** Clear pressing — translucent face and lighter shadows; the label stays. */
export const ClearFinish: Story = {
  render: () => {
    useUIStore.setState({ vinylLabelSource: 'logo', vinylRingStyle: 'off', vinylFinish: 'clear' });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.vinyl-disc')).toHaveAttribute(
      'data-finish',
      'clear'
    );
  },
};

/** Marble pressing — an accent-tinted conic swirl that revolves with the grooves. */
export const MarbleFinish: Story = {
  render: () => {
    useUIStore.setState({ vinylLabelSource: 'logo', vinylRingStyle: 'off', vinylFinish: 'marble' });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.vinyl-disc')).toHaveAttribute(
      'data-finish',
      'marble'
    );
  },
};

/**
 * Picture disc — the album art is spread across the whole face under a groove
 * film; the paper label disappears (the art IS the face).
 */
export const PictureDisc: Story = {
  render: () => {
    useUIStore.setState({ vinylRingStyle: 'off', vinylFinish: 'picture' });
    return <VinylRecord albumArt={STORY_COVER} albumAlt="Late Nights" />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.vinyl-picture-grooves')).toBeInTheDocument();
    await expect(canvasElement.querySelector('.vinyl-label')).not.toBeInTheDocument();
  },
};

/** Tonearm overlay — parked in the lifted pose here since story playback is paused. */
export const Tonearm: Story = {
  render: () => {
    useUIStore.setState({
      vinylLabelSource: 'logo',
      vinylRingStyle: 'off',
      vinylTonearmEnabled: true,
    });
    return <VinylRecord albumArt={null} albumAlt="Late Nights" />;
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="vinyl-tonearm"]')).toHaveAttribute(
      'data-resting',
      'false'
    );
  },
};
