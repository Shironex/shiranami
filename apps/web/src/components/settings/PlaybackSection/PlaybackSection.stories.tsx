import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import PlaybackSection from './PlaybackSection';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta: Meta<typeof PlaybackSection> = {
  title: 'settings/PlaybackSection',
  component: PlaybackSection,
  decorators: [
    Story => (
      <QueryClientProvider client={client}>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaybackSection>;

export const Default: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({
        crossfadeEnabled: false,
        loudnessEnabled: false,
        sleepFadeDuration: 5,
      });
      return <Story />;
    },
  ],
};

export const CrossfadeAndLoudnessOn: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({
        crossfadeEnabled: true,
        crossfadeDuration: 6,
        loudnessEnabled: true,
        loudnessTargetLufs: -14,
        sleepFadeDuration: 8,
      });
      return <Story />;
    },
  ],
};
