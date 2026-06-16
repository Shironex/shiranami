import type { Meta, StoryObj } from '@storybook/react-vite';
import { useUIStore } from '@/stores/useUIStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import VisualizerStrip from './VisualizerStrip';

/**
 * shared · VisualizerStrip. The absolutely-positioned visualizer strip docked
 * inside <main>. The active visualizer is a lazy chunk wrapped in Suspense, so
 * the story shows the positioned container; seeded with the default bars style,
 * bottom-docked.
 */
const meta: Meta<typeof VisualizerStrip> = {
  title: 'shared/VisualizerStrip',
  component: VisualizerStrip,
  decorators: [
    Story => {
      useUIStore.setState({ visualizerStyle: 'bars' });
      useLayoutStore.setState({ visualizerPosition: 'bottom' });
      return (
        <div className="relative w-full h-64">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerStrip>;

export const Default: Story = {};
