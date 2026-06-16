import type { Meta, StoryObj } from '@storybook/react-vite';
import TrackThumbnail from './TrackThumbnail';

const meta: Meta<typeof TrackThumbnail> = {
  title: 'shared/TrackThumbnail',
  component: TrackThumbnail,
};
export default meta;

type Story = StoryObj<typeof TrackThumbnail>;

export const Default: Story = {
  args: {
    albumArt: 'https://placehold.co/96x96',
    alt: 'Album cover',
    fallback: <span className="text-xs text-muted-foreground">No art</span>,
    className: 'w-24 h-24 rounded-lg bg-muted',
  },
};

export const Fallback: Story = {
  args: {
    albumArt: null,
    alt: 'No cover',
    fallback: <span className="text-xs text-muted-foreground">No art</span>,
    className: 'w-24 h-24 rounded-lg bg-muted',
  },
};
