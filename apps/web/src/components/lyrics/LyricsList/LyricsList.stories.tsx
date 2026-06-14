import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsList from './LyricsList';

const LINES: LyricLine[] = [
  { time: 0, text: 'Sunlight through the curtains' },
  { time: 4, text: 'A quiet morning hum' },
  { time: 8, text: 'Coffee going cold again' },
  { time: 12, text: 'And the day has just begun' },
  { time: 16, text: 'Lo-fi drifting in the air' },
];

const SIZED_CLASSES = {
  baseClassName: 'block w-full text-left leading-relaxed font-medium text-base px-1',
  activeClassName: 'text-foreground font-semibold',
  pastClassName: 'text-foreground/50',
  idleClassName: 'text-foreground/30',
};

const meta: Meta<typeof LyricsList> = {
  title: 'lyrics/LyricsList',
  component: LyricsList,
  args: {
    lines: LINES,
    activeIndex: 2,
    onLineClick: () => {},
    spacingClassName: 'space-y-4',
    ...SIZED_CLASSES,
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

type Story = StoryObj<typeof LyricsList>;

export const Default: Story = {};
