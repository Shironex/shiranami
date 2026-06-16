import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';

import VisualizerSection from './VisualizerSection';

/**
 * settings · VisualizerSection. The audio-visualizer card. A "Show visualizer"
 * switch gates the rest: when on, a position Select (`role="combobox"`), a live
 * style preview tile, and a grid of selectable style buttons appear; when off,
 * those controls are hidden. The switch toggles the UI store and the style grid
 * writes the chosen style back to it. Stories seed the store on entry.
 *
 * a11y stays at `'todo'`: the embedded live preview renders a lazy `<canvas>`
 * visualizer over a dark gradient tile (decorative, non-deterministic) that
 * axe's color-contrast pass can't evaluate, and that preview is out of this
 * story's scope. Same deferral precedent as splash/SplashScreen and
 * debug/DebugOverlay.
 */
const meta: Meta<typeof VisualizerSection> = {
  title: 'settings/VisualizerSection',
  component: VisualizerSection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerSection>;

/** Visualizer on: the position select and the style grid both render. */
export const Enabled: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ showVisualizer: true, visualizerStyle: 'bars' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Visualizer' })).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Show visualizer' })).toBeChecked();
    // The position dropdown only renders while the visualizer is on.
    await expect(canvas.getByRole('combobox')).toBeInTheDocument();

    // The style grid marks the active tile pressed; picking another updates the store.
    const bars = canvas.getByRole('button', { name: /Bars/ });
    await expect(bars).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(canvas.getByRole('button', { name: /Waveform/ }));
    await waitFor(() => expect(useUIStore.getState().visualizerStyle).toBe('waveform'));
  },
};

/** Visualizer off: only the gating switch shows, no position or style controls. */
export const Disabled: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ showVisualizer: false });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('switch', { name: 'Show visualizer' })).not.toBeChecked();
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Bars/ })).not.toBeInTheDocument();
  },
};
