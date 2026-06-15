import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SplashScreen from './SplashScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta: Meta<typeof SplashScreen> = {
  title: 'splash/SplashScreen',
  component: SplashScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SplashScreen>;

export const Loading: Story = {
  args: {
    isLoading: true,
    isError: false,
  },
};

export const Error: Story = {
  args: {
    isLoading: false,
    isError: true,
    error: 'Could not read your music library.',
  },
};
