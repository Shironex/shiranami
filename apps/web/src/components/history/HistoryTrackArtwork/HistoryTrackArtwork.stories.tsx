import type { Meta, StoryObj } from '@storybook/react-vite';

import HistoryTrackArtwork from './HistoryTrackArtwork';

const meta: Meta<typeof HistoryTrackArtwork> = {
  title: 'history/HistoryTrackArtwork',
  component: HistoryTrackArtwork,
  decorators: [
    Story => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryTrackArtwork>;

export const Default: Story = {
  args: {
    albumArt: null,
    title: 'Midnight study session',
  },
};
