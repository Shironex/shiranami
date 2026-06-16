import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';

import VisualEffectsSection from './VisualEffectsSection';

/**
 * settings · VisualEffectsSection. Four immersive-effect switches — Now Playing
 * view, Now playing banner, Low performance mode, Noise texture — each labelled
 * via `aria-labelledby` and paired with a live preview tile beneath it. The
 * switches read and write the UI store directly, so flipping one updates the
 * store and re-renders the matching preview. Stories seed the store on entry.
 *
 * a11y stays at `'todo'`: the embedded effect-preview tiles render decorative
 * mock chrome with low-opacity tinted text (e.g. amber "Reduced" badges on a
 * faint wash) that can't be guaranteed to clear axe's color-contrast threshold,
 * and those preview components are out of this story's scope to change. Same
 * deferral precedent as splash/SplashScreen and debug/DebugOverlay.
 */
const meta: Meta<typeof VisualEffectsSection> = {
  title: 'settings/VisualEffectsSection',
  component: VisualEffectsSection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualEffectsSection>;

/** Now-playing effects on, perf/noise off — the four switches mirror the store. */
export const Default: Story = {
  decorators: [
    Story => {
      useUIStore.setState({
        nowPlayingViewEnabled: true,
        libraryHeroCardEnabled: true,
        lowPerformanceMode: false,
        noiseOverlayEnabled: false,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Visual effects' })).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Now Playing view' })).toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Low performance mode' })).not.toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Noise texture' })).not.toBeChecked();
  },
};

/** Toggling low performance mode flips both the switch and the backing store. */
export const TogglesLowPerformance: Story = {
  decorators: [
    Story => {
      useUIStore.setState({
        nowPlayingViewEnabled: true,
        libraryHeroCardEnabled: true,
        lowPerformanceMode: false,
        noiseOverlayEnabled: false,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const lowPerf = canvas.getByRole('switch', { name: 'Low performance mode' });
    await expect(lowPerf).not.toBeChecked();

    await userEvent.click(lowPerf);

    await waitFor(() => expect(lowPerf).toBeChecked());
    await expect(useUIStore.getState().lowPerformanceMode).toBe(true);
  },
};
