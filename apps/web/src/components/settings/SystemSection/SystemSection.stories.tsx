import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SystemSection from './SystemSection';

const queryClient = new QueryClient();

const meta: Meta<typeof SystemSection> = {
  title: 'settings/SystemSection',
  component: SystemSection,
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SystemSection>;

export const Default: Story = {};
