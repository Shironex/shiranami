import type { Meta, StoryObj } from '@storybook/react-vite';
import PanelResizeHandle from './PanelResizeHandle';

/**
 * shared · PanelResizeHandle. The invisible-until-hovered vertical drag handle
 * for resizable shell panels — pointer drag plus keyboard (arrows nudge, Home
 * resets). Rendered inside a relative box so the absolutely-positioned handle
 * has a containing block.
 */
const meta: Meta<typeof PanelResizeHandle> = {
  title: 'shared/PanelResizeHandle',
  component: PanelResizeHandle,
  decorators: [
    Story => (
      <div className="relative w-64 h-40 border border-border/40">
        <Story />
      </div>
    ),
  ],
  args: {
    edge: 'right',
    value: 320,
    min: 240,
    max: 480,
    onChange: () => {},
    onReset: () => {},
    'aria-label': 'Resize panel',
  },
};

export default meta;

type Story = StoryObj<typeof PanelResizeHandle>;

export const Default: Story = {};
