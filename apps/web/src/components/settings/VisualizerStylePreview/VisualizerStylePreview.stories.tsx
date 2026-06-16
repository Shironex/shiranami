import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';

import VisualizerStylePreview from './VisualizerStylePreview';

/**
 * settings · VisualizerStylePreview. A self-animating preview of the active
 * visualizer style, fed by a deterministic synthetic frequency source so it
 * renders without touching the playback engine. It frames a lazily-loaded
 * `<canvas>` visualizer (suspends with a null fallback) beneath a "Preview"
 * label and reads the chosen style from the UI store. Stories seed the style.
 *
 * a11y stays at `'todo'`: this is a decorative `<canvas>` preview on a dark
 * gradient tile whose pixels axe can't evaluate for color-contrast, and whose
 * lazy render is non-deterministic. Same deferral precedent as
 * splash/SplashScreen and debug/DebugOverlay.
 */
const meta: Meta<typeof VisualizerStylePreview> = {
  title: 'settings/VisualizerStylePreview',
  component: VisualizerStylePreview,
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerStylePreview>;

/** Bars style: the preview frame and its "Preview" label render. */
export const Bars: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ visualizerStyle: 'bars' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The surrounding chrome renders synchronously; the lazy canvas may suspend.
    await expect(canvas.getByText('Preview')).toBeInTheDocument();
  },
};

/** Waveform style: the same labelled preview frame renders for a different style. */
export const Waveform: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ visualizerStyle: 'waveform' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Preview')).toBeInTheDocument();
  },
};
