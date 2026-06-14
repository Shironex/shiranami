import type { Meta, StoryObj } from '@storybook/react-vite';

import ClockCard from './ClockCard';

const meta: Meta<typeof ClockCard> = {
  title: 'overview/ClockCard',
  component: ClockCard,
  decorators: [
    Story => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ClockCard>;

export const TimeOfDay: Story = {};

export const WithWeatherGlyph: Story = {
  args: {
    glyph: '雨',
    weatherRow: (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground/85">Rain · 12°C</p>
        <p className="truncate text-xs text-muted-foreground/60">A good night for slow records.</p>
      </div>
    ),
  },
};
