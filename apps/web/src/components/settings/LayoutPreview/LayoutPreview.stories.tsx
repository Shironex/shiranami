import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useLayoutStore } from '@/stores/useLayoutStore';

import LayoutPreview from './LayoutPreview';

/**
 * settings · LayoutPreview. A scaled mock of the app shell shown in the
 * Interface settings section. It reads the live `useLayoutStore`, so the two
 * movable pieces — the side panel and the visualizer strip, both tinted primary
 * — jump to their docked slot as the position settings change. The sidebar,
 * top bar and player bar are fixed skeleton chrome. The surface is exposed as a
 * labelled `role="img"`.
 */
const meta: Meta<typeof LayoutPreview> = {
  title: 'settings/LayoutPreview',
  component: LayoutPreview,
  parameters: {
    // A single labelled role="img" over decorative skeleton blocks — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LayoutPreview>;

/** Shipping defaults — side panel docked right, visualizer along the bottom. */
export const Default: Story = {
  beforeEach: () => {
    useLayoutStore.setState({ sidePanelSide: 'right', visualizerPosition: 'bottom' });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Layout preview' })).toBeInTheDocument();
    // Docked right: nothing follows the side-panel block in the content row.
    const panel = canvasElement.querySelector('.w-9');
    await expect(panel?.nextElementSibling).toBeNull();
    // Docked bottom: the content row precedes the visualizer strip.
    const strip = canvasElement.querySelector('.w-1')?.parentElement;
    await expect(strip?.previousElementSibling).toHaveClass('min-h-0');
  },
};

/** Both movable pieces flipped — side panel left, visualizer along the top. */
export const PanelLeftVisualizerTop: Story = {
  beforeEach: () => {
    useLayoutStore.setState({ sidePanelSide: 'left', visualizerPosition: 'top' });
  },
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector('.w-9');
    await expect(panel?.previousElementSibling).toBeNull();
    const strip = canvasElement.querySelector('.w-1')?.parentElement;
    await expect(strip?.nextElementSibling).toHaveClass('min-h-0');
  },
};
