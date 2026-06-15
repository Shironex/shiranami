import type { Meta, StoryObj } from '@storybook/react-vite';

import SettingsPreview from './SettingsPreview';

const meta = {
  title: 'settings/SettingsPreview',
  component: SettingsPreview,
} satisfies Meta<typeof SettingsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Preview',
    children: (
      <div className="rounded-xl border border-border/30 bg-surface/50 p-6 text-sm text-muted-foreground">
        Preview content
      </div>
    ),
  },
};
