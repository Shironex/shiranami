import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_DISCORD_TEMPLATES, type DiscordRpcSettings } from '@shiranami/shared';

import DiscordSection from './DiscordSection';

/** Point the story's IPC mock at a concrete settings object so the card renders. */
function seedDiscord(settings: DiscordRpcSettings): void {
  window.electronAPI.discord.getSettings = () => Promise.resolve(settings);
}

const meta: Meta<typeof DiscordSection> = {
  title: 'settings/DiscordSection',
  component: DiscordSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiscordSection>;

export const Default: Story = {
  decorators: [
    Story => {
      seedDiscord({
        enabled: true,
        showTrackDetails: true,
        showElapsedTime: true,
        useCustomTemplates: false,
        templates: DEFAULT_DISCORD_TEMPLATES,
      });
      return <Story />;
    },
  ],
};

export const CustomTemplates: Story = {
  decorators: [
    Story => {
      seedDiscord({
        enabled: true,
        showTrackDetails: true,
        showElapsedTime: true,
        useCustomTemplates: true,
        templates: DEFAULT_DISCORD_TEMPLATES,
      });
      return <Story />;
    },
  ],
};
