import type { Meta, StoryObj } from '@storybook/react-vite';

import ToolVersionBlock from './ToolVersionBlock';

const meta = {
  title: 'settings/downloads/ToolVersionBlock',
  component: ToolVersionBlock,
} satisfies Meta<typeof ToolVersionBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    installedVersion: 'v2024.03.10',
    latestVersion: 'v2024.04.01',
  },
};

export const NoLatest: Story = {
  args: {
    installedVersion: 'v2024.03.10',
    latestVersion: null,
  },
};
