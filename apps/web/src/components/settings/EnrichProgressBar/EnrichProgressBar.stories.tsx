import type { Meta, StoryObj } from '@storybook/react-vite';
import type { EnrichProgress } from '@shiranami/contracts';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';

import EnrichProgressBar from './EnrichProgressBar';

function seed(progress: EnrichProgress, isCancelling = false): void {
  useMetadataEnrichStore.setState({ isEnriching: true, isCancelling, progress });
}

const meta: Meta<typeof EnrichProgressBar> = {
  title: 'settings/EnrichProgressBar',
  component: EnrichProgressBar,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Searching: Story = {
  decorators: [
    Story => {
      seed({ current: 3, total: 12, trackName: 'feels.mp3', status: 'searching' });
      return <Story />;
    },
  ],
};

export const Done: Story = {
  decorators: [
    Story => {
      seed({
        current: 8,
        total: 12,
        trackName: 'Modal Soul',
        status: 'done',
        confidence: 0.92,
        source: 'itunes',
      });
      return <Story />;
    },
  ],
};
