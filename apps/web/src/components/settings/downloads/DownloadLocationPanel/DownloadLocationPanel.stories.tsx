import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';

import DownloadLocationPanel from './DownloadLocationPanel';

/**
 * settings/downloads · DownloadLocationPanel. Shows where search downloads are
 * saved: a "Default"/"Custom" origin badge, the resolved path, a hint, a
 * "Change location" button that opens the directory picker, and — only for a
 * custom location — a "Reset to default" button. Both buttons disable while an
 * update is in flight. Purely prop-driven (no IPC), so stories pass `fn()`
 * spies for `onChange`/`onReset` and assert the rendered path + button wiring.
 */
const meta: Meta<typeof DownloadLocationPanel> = {
  title: 'settings/downloads/DownloadLocationPanel',
  component: DownloadLocationPanel,
  parameters: {
    // Plain text + two named buttons, no decorative-naming gaps — axe clean.
    a11y: { test: 'error' },
  },
  args: {
    onChange: fn(),
    onReset: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof DownloadLocationPanel>;

/** Default location: the change button works, the reset button is hidden. */
export const Default: Story = {
  args: {
    pathDisplay: '/Users/me/Music/Downloads',
    isDefault: true,
    updating: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('/Users/me/Music/Downloads')).toBeInTheDocument();
    // Reset is only offered for a custom location.
    await expect(
      canvas.queryByRole('button', { name: /Reset to default/ })
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /Change location/ }));
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

/** Custom location: both the change and reset affordances render. */
export const Custom: Story = {
  args: {
    pathDisplay: '/Volumes/External/Lofi',
    isDefault: false,
    updating: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('/Volumes/External/Lofi')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Change location/ })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /Reset to default/ }));
    await expect(args.onReset).toHaveBeenCalledTimes(1);
  },
};

/** Updating: both buttons are disabled while a location change is in flight. */
export const Updating: Story = {
  args: {
    pathDisplay: '/Volumes/External/Lofi',
    isDefault: false,
    updating: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('button', { name: /Change location/ })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: /Reset to default/ })).toBeDisabled();
  },
};
