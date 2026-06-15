import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '@/components/ui/tooltip';

import SettingsView from './SettingsView';

const meta: Meta<typeof SettingsView> = {
  title: 'settings/SettingsView',
  component: SettingsView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="flex h-screen w-full flex-col">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
