import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AboutSection from './AboutSection';

const queryClient = new QueryClient();

const meta: Meta<typeof AboutSection> = {
  title: 'settings/AboutSection',
  component: AboutSection,
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-[680px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AboutSection>;

export const Default: Story = {};
