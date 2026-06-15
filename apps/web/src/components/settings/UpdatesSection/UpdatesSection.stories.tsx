import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UpdatesSection from './UpdatesSection';

const queryClient = new QueryClient();

const meta: Meta<typeof UpdatesSection> = {
  title: 'settings/UpdatesSection',
  component: UpdatesSection,
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

type Story = StoryObj<typeof UpdatesSection>;

export const Default: Story = {};
