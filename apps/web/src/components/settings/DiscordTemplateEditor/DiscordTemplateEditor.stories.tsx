import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';

import DiscordTemplateEditor from './DiscordTemplateEditor';

const meta: Meta<typeof DiscordTemplateEditor> = {
  title: 'settings/DiscordTemplateEditor',
  component: DiscordTemplateEditor,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiscordTemplateEditor>;

export const Default: Story = {
  args: {
    selectedActivity: 'playing',
    onActivityChange: () => {},
    currentTemplate: DEFAULT_DISCORD_TEMPLATES.playing,
    onTemplateChange: () => {},
    onReset: () => {},
  },
};
