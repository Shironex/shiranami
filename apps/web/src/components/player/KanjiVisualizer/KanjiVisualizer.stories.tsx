import type { Meta, StoryObj } from '@storybook/react-vite';

import KanjiVisualizer from './KanjiVisualizer';

const meta: Meta<typeof KanjiVisualizer> = {
  title: 'player/KanjiVisualizer',
  component: KanjiVisualizer,
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof KanjiVisualizer>;

export const Default: Story = {
  render: () => <KanjiVisualizer active />,
};
