import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import ToolStatusRow from './ToolStatusRow';

/**
 * settings/downloads · ToolStatusRow. A single tool's install status line: a
 * decorative state glyph (check when installed, download when missing), the
 * matching title, and a trailing status word — "Up to date" or "Update
 * available" when installed, or optional content (e.g. "recommended") when not.
 * Purely prop-driven; stories assert the branch text that renders.
 */
const meta: Meta<typeof ToolStatusRow> = {
  title: 'settings/downloads/ToolStatusRow',
  component: ToolStatusRow,
  parameters: {
    // Plain status text with decorative lucide glyphs — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ToolStatusRow>;

/** Installed and current: the installed title plus an "Up to date" status. */
export const Default: Story = {
  args: {
    installed: true,
    installedTitle: 'yt-dlp installed',
    notInstalledTitle: 'yt-dlp not installed',
    updateAvailable: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('yt-dlp installed')).toBeInTheDocument();
    await expect(canvas.getByText('Up to date')).toBeInTheDocument();
  },
};

/** Installed with a newer release: the "Update available" status shows instead. */
export const UpdateAvailable: Story = {
  args: {
    installed: true,
    installedTitle: 'yt-dlp installed',
    notInstalledTitle: 'yt-dlp not installed',
    updateAvailable: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('yt-dlp installed')).toBeInTheDocument();
    await expect(canvas.getByText('Update available')).toBeInTheDocument();
    await expect(canvas.queryByText('Up to date')).not.toBeInTheDocument();
  },
};

/** Not installed: the missing title plus the trailing "recommended" hint. */
export const NotInstalled: Story = {
  args: {
    installed: false,
    installedTitle: 'ffmpeg installed',
    notInstalledTitle: 'ffmpeg not installed',
    updateAvailable: false,
    notInstalledRight: 'recommended',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('ffmpeg not installed')).toBeInTheDocument();
    await expect(canvas.getByText('recommended')).toBeInTheDocument();
  },
};
