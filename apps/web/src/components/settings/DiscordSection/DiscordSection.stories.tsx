import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import DiscordSection from './DiscordSection';

/**
 * settings · DiscordSection. The Discord Rich Presence panel. Settings load from
 * an on-mount IPC read (`discord.getSettings`) gated on `IS_ELECTRON`; until they
 * arrive the component renders `if (!settings) return null`. With presence
 * enabled it shows a header switch ("Enable Discord Rich Presence"), the "Show
 * track details" / "Show elapsed time" / "Custom templates" toggles, a Save
 * button, a live "Preview" card, and an info callout.
 *
 * In the Storybook browser run `IS_ELECTRON` resolves to `false` — `@/lib/platform`
 * captures it as a module-constant before the preview installs the electronAPI
 * mock — so the on-mount `discord.getSettings` read is skipped entirely, `settings`
 * stays null, and the component renders nothing. The loaded card is unreachable
 * in-browser (no IPC seed can flip the false module-constant), so the story
 * asserts the render-null contract.
 */
const meta: Meta<typeof DiscordSection> = {
  title: 'settings/DiscordSection',
  component: DiscordSection,
  // Outside Electron the section renders nothing, so there are no roles to
  // audit — axe passes trivially clean.
  parameters: { a11y: { test: 'error' } },
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

/**
 * Gated outside Electron — settings never load (`IS_ELECTRON` is false), so
 * `if (!settings) return null` keeps the whole panel off-screen.
 */
export const GatedOutsideElectron: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // None of the loaded-card surfaces are reachable without IPC-delivered
    // settings, which the false IS_ELECTRON module-constant prevents.
    await expect(canvas.queryByText('Discord Rich Presence')).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('switch', { name: 'Enable Discord Rich Presence' })
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Preview' })).not.toBeInTheDocument();
  },
};
