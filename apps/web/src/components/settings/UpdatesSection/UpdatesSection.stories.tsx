import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';

import UpdatesSection from './UpdatesSection';

/**
 * settings · UpdatesSection. The app-update card. Its layout forks on platform:
 * macOS (unsigned, no auto-update) shows a notice plus an "Open GitHub Releases"
 * link, while the non-macOS branch shows a "Check for updates" button,
 * conditional download/install buttons, a status line, and a download progress
 * bar.
 *
 * The fork is `isMac = IS_ELECTRON && platform === 'darwin'`. In the Storybook
 * browser run `IS_ELECTRON` is a false module-constant (`@/lib/platform` is
 * imported before the preview installs the electronAPI mock), so `isMac` is
 * false and the NON-macOS branch renders: a "Check for updates" button and the
 * idle "No updates available" status. The download/install buttons and progress
 * bar stay unreachable here (they need live updater events), so the story
 * asserts the idle default controls of that branch.
 */
const meta: Meta<typeof UpdatesSection> = {
  title: 'settings/UpdatesSection',
  component: UpdatesSection,
  parameters: {
    // Real heading, a named "Check for updates" button, and an idle status
    // paragraph — every control carries an accessible name, axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <QueryClientProvider client={client}>
          <div className="max-w-[640px] p-4">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof UpdatesSection>;

/**
 * Non-macOS branch (IS_ELECTRON is a false module-constant here, so isMac is
 * false): the "Check for updates" button and the idle "No updates available"
 * status, with no download/install controls until live updater events arrive.
 */
export const CheckForUpdates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Updates' })).toBeInTheDocument();

    // The manual check control is a real, enabled button in the idle state.
    await expect(canvas.getByRole('button', { name: 'Check for updates' })).toBeEnabled();

    // Idle status line — nothing to download yet.
    await expect(canvas.getByText('No updates available')).toBeInTheDocument();

    // Download / install actions only appear once an update is available/ready,
    // which needs live updater events that the no-op IPC mock never emits.
    await expect(
      canvas.queryByRole('button', { name: 'Install and restart' })
    ).not.toBeInTheDocument();

    // The macOS-only unsigned-build notice is not on this branch.
    await expect(
      canvas.queryByText(/Auto-updates are not available on macOS/)
    ).not.toBeInTheDocument();
  },
};
