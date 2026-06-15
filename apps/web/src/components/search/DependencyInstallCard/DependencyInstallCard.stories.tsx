import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';

import DependencyInstallCard from './DependencyInstallCard';

/**
 * search · DependencyInstallCard. The "tools missing" state card shown by
 * SearchView when yt-dlp (and optionally ffmpeg) need installing. Renders inside
 * the shared status card and switches between an install button (with an inline
 * error), a determinate download progress block, and a success confirmation —
 * driven entirely by `installStatus` / `isInstallInProgress`. Stories cover each
 * branch via args.
 */
const meta: Meta<typeof DependencyInstallCard> = {
  title: 'search/DependencyInstallCard',
  component: DependencyInstallCard,
  parameters: {
    // The install button is a real labelled <button>, the progress bar carries
    // its role, and the status-card mascot is decorative (alt="") — axe passes
    // clean.
    a11y: { test: 'error' },
  },
  args: {
    ffmpegInstalled: false,
    installStatus: 'idle',
    installError: null,
    isInstallInProgress: false,
    installProgress: 0,
    installLabel: '',
    onInstall: fn(),
  },
  decorators: [
    Story => (
      <div className="flex h-[32rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DependencyInstallCard>;

/** Idle — the install CTA; clicking it fires `onInstall`. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Search tools missing')).toBeInTheDocument();

    const install = canvas.getByRole('button', { name: 'Install Missing Tools' });
    await userEvent.click(install);
    await expect(args.onInstall).toHaveBeenCalled();
  },
};

/** Installing — the determinate progress block replaces the install button. */
export const Installing: Story = {
  args: {
    installStatus: 'downloading',
    isInstallInProgress: true,
    installProgress: 55,
    installLabel: 'Downloading yt-dlp',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55');
    await expect(canvas.getByText(/Downloading yt-dlp\.\.\. 55%/)).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Install Missing Tools' })
    ).not.toBeInTheDocument();
  },
};

/** Done — the success confirmation, no install button. */
export const Done: Story = {
  args: {
    installStatus: 'done',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Search tools installed')).toBeInTheDocument();
  },
};

/** Errored — the install button with the inline error message beneath it. */
export const Errored: Story = {
  args: {
    installStatus: 'error',
    installError: 'Network timeout',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Install Missing Tools' })).toBeInTheDocument();
    await expect(canvas.getByText('Network timeout')).toBeInTheDocument();
  },
};
