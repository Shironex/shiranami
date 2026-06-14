import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLibraryStore } from '@/stores/useLibraryStore';

import ScanProgressCard from './ScanProgressCard';

const meta: Meta<typeof ScanProgressCard> = {
  title: 'library/ScanProgressCard',
  component: ScanProgressCard,
  decorators: [
    Story => (
      <div className="w-[20rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ScanProgressCard>;

export const Default: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        scanState: 'scanning',
        scanProgress: {
          fileIndex: 42,
          fileCount: 120,
          currentFile: 'Lofi beats/Midnight study session.flac',
        },
      });
      return <Story />;
    },
  ],
};

export const Cancelling: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        scanState: 'cancelling',
        scanProgress: {
          fileIndex: 88,
          fileCount: 120,
          currentFile: 'Rainy day cafe/Slow morning coffee.flac',
        },
      });
      return <Story />;
    },
  ],
};
