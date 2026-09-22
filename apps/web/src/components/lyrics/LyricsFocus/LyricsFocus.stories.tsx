import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect, fn } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsFocus from './LyricsFocus';

const LINES: LyricLine[] = [
  { time: 0, text: 'City lights are fading out' },
  { time: 8, text: 'Rain against the window now' },
  { time: 16, text: 'Every hour slows to a crawl' },
  { time: 40, text: 'Morning finds us after all' },
  { time: 48, text: 'Nothing here we need to say' },
];

/**
 * lyrics · LyricsFocus. The depth-of-field presentation: the active line large
 * in the display serif, neighbours receding in blur/opacity, breathing accent
 * dots during ≥6s instrumental stretches. Lines stay real buttons — seekable
 * and accessible. Reads `useUIStore` (low-perf swaps blur for opacity) and
 * `usePlaybackStore.currentTime` (the instrumental-gap clock).
 */
const meta: Meta<typeof LyricsFocus> = {
  title: 'lyrics/LyricsFocus',
  component: LyricsFocus,
  parameters: {
    a11y: { test: 'error' },
  },
  args: {
    synced: LINES,
    activeLine: 2,
    onLineClick: fn(),
    syncedDimOpacity: 0.45,
  },
  decorators: [
    Story => {
      useUIStore.setState({ lowPerformanceMode: false });
      return (
        <div className="flex h-96 flex-col bg-background">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsFocus>;

/** Mid-song: the active line in focus, neighbours receding around it. */
export const Default: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ currentTime: 17 });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Every hour slows to a crawl' })
    ).toBeInTheDocument();
    // Neighbours are still real, named buttons despite the blur.
    await expect(
      canvas.getByRole('button', { name: 'Rain against the window now' })
    ).toBeInTheDocument();
  },
};

/** Inside the 24s instrumental stretch: three accent dots breathe. */
export const InstrumentalGap: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ currentTime: 25 });
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="breathing-dots"]')).toBeInTheDocument();
  },
};
