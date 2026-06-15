import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import DownloadsSection from './DownloadsSection';

/**
 * settings/downloads · DownloadsSection. The yt-dlp / ffmpeg tool-management
 * card: a real `<h3>` heading ("Downloads"), a labelled refresh icon button in
 * the header, and — once tool status resolves — install/version/location rows.
 *
 * Tool status is read on mount from the main process via
 * `electronAPI.downloader.getCachedToolStatus()` / `refreshToolStatus()`. Under
 * Storybook the mock bridge resolves those to `undefined`, so installed-state
 * stays `null` and the section renders its loading **skeleton** indefinitely
 * (the binary path / version rows never appear). The story asserts the header
 * chrome that always renders plus the checking state; the populated tool rows
 * are covered by the leaf components' own stories (ToolStatusRow,
 * ToolVersionBlock, DownloadLocationPanel, InstallProgressBar).
 */
const meta: Meta<typeof DownloadsSection> = {
  title: 'settings/downloads/DownloadsSection',
  component: DownloadsSection,
  parameters: {
    // Real heading + a refresh icon button carrying an aria-label, over a
    // decorative skeleton (no semantic content) — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DownloadsSection>;

/** Browser/checking state: header chrome renders, the skeleton holds the body. */
export const Checking: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Downloads' })).toBeInTheDocument();

    // The refresh control is labelled; it's disabled while tool status is unknown.
    const refresh = canvas.getByRole('button', { name: 'Refresh tool status' });
    await expect(refresh).toBeInTheDocument();
    await expect(refresh).toBeDisabled();

    // While checking, the populated yt-dlp path / version rows are not yet shown.
    await expect(canvas.queryByText('Binary path')).not.toBeInTheDocument();
  },
};
