import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';

import ToolAutoUpdatePanel from './ToolAutoUpdatePanel';

/**
 * settings/downloads · ToolAutoUpdatePanel. The opt-in for keeping yt-dlp and
 * ffmpeg up to date automatically, off by default, plus a quiet status line per
 * tool once it is on: the version automatic updating installed, and when it
 * last checked. Purely prop-driven (no IPC), so stories pass a `fn()` spy for
 * the toggle and a fixed record.
 */
const meta: Meta<typeof ToolAutoUpdatePanel> = {
  title: 'settings/downloads/ToolAutoUpdatePanel',
  component: ToolAutoUpdatePanel,
  parameters: {
    // A labelled switch and plain text: axe clean.
    a11y: { test: 'error' },
  },
  args: {
    onEnabledChange: fn(),
    disabled: false,
    ffmpegIncluded: true,
    record: {
      ytdlp: {
        lastCheckedAt: Date.UTC(2026, 8, 28, 12, 0),
        lastUpdatedAt: Date.UTC(2026, 8, 27, 9, 30),
        lastUpdatedVersion: '2026.09.20',
        consecutiveFailures: 0,
      },
      ffmpeg: {
        lastCheckedAt: Date.UTC(2026, 8, 25, 18, 0),
        consecutiveFailures: 0,
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ToolAutoUpdatePanel>;

/** Off, the default: no status lines, and the switch turns it on. */
export const Off: Story = {
  args: { enabled: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: /up to date automatically/i });

    await expect(toggle).not.toBeChecked();
    await expect(canvas.queryByText(/Last checked/)).not.toBeInTheDocument();

    await userEvent.click(toggle);
    await expect(args.onEnabledChange).toHaveBeenCalledWith(true);
  },
};

/** On, after yt-dlp was updated automatically. */
export const On: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(/Updated automatically to 2026\.09\.20/)).toBeInTheDocument();
    await expect(canvas.getAllByText(/Last checked/)).toHaveLength(2);
  },
};

/** On, before the first check has run. */
export const NeverChecked: Story = {
  args: {
    enabled: true,
    record: { ytdlp: { consecutiveFailures: 0 }, ffmpeg: { consecutiveFailures: 0 } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByText('Not checked yet')).toHaveLength(2);
  },
};

/** macOS: ffmpeg is only ever updated by hand there, so it has no row. */
export const MacOs: Story = {
  args: { enabled: true, ffmpegIncluded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('yt-dlp')).toBeInTheDocument();
    await expect(canvas.queryByText('ffmpeg')).not.toBeInTheDocument();
  },
};

/** Disabled until the backend has answered. */
export const Disabled: Story = {
  args: { enabled: false, disabled: true, record: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('switch', { name: /up to date automatically/i })).toBeDisabled();
  },
};
