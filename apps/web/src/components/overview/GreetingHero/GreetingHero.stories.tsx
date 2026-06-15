import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import GreetingHero from './GreetingHero';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta: Meta<typeof GreetingHero> = {
  title: 'overview/GreetingHero',
  component: GreetingHero,
  decorators: [
    Story => (
      <QueryClientProvider client={client}>
        <div className="w-[48rem]">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof GreetingHero>;

export const Default: Story = {};
