import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsBody from './LyricsBody';

const SYNCED: LyricLine[] = [
  { time: 0, text: 'Warm light on the windowsill' },
  { time: 4, text: 'The kettle starting to sing' },
  { time: 8, text: 'A slow and easy morning' },
  { time: 12, text: 'Before the day begins' },
];

const baseArgs = {
  activeLine: 1,
  isLoading: false,
  onLineClick: () => {},
  loadingLabel: 'Finding lyrics...',
  emptyLabel: 'No lyrics found',
  syncedDimOpacity: 0.4,
  plainOpacity: 0.85,
  syncedSpacingClassName: 'space-y-4',
  syncedBaseClassName: 'block w-full text-left leading-relaxed font-medium text-base px-1',
  syncedActiveClassName: 'text-foreground font-semibold',
  syncedPastClassName: 'text-foreground/50',
  syncedIdleClassName: 'text-foreground/30',
  plainTextClassName: 'text-foreground whitespace-pre-wrap font-sans font-medium',
};

const meta: Meta<typeof LyricsBody> = {
  title: 'lyrics/LyricsBody',
  component: LyricsBody,
  args: {
    ...baseArgs,
    synced: SYNCED,
    plain: null,
  },
  decorators: [
    Story => (
      <div className="flex h-[24rem] w-[28rem] flex-col p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsBody>;

export const Synced: Story = {};

export const Plain: Story = {
  args: {
    synced: null,
    plain: 'Line one of the plain lyrics\nLine two\nLine three',
  },
};

export const Loading: Story = {
  args: {
    synced: null,
    plain: null,
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    synced: null,
    plain: null,
  },
};
