import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import InstallProgressBar from './InstallProgressBar';

/**
 * settings/downloads · InstallProgressBar. The determinate progress indicator
 * shown while a download tool (yt-dlp / ffmpeg) installs: a `role="progressbar"`
 * with `aria-valuenow` over a caption, wrapped in a `role="status"`
 * `aria-live="polite"` region so the caption is announced as it updates. Purely
 * presentational and prop-driven (`percent`, `caption`). Stories assert the
 * reported value and the live-region caption.
 *
 * a11y stays at `'todo'`: the underlying `ProgressBar` primitive only sets an
 * accessible name when given an `aria-label`, and this component doesn't pass
 * one — so axe's `aria-progressbar-name` rule flags the unnamed progressbar.
 * Adding the name lives in the shared ui ProgressBar / this component's source,
 * both outside this story's scope, so the deferral is intentional.
 */
const meta: Meta<typeof InstallProgressBar> = {
  title: 'settings/downloads/InstallProgressBar',
  component: InstallProgressBar,
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof InstallProgressBar>;

/** Mid-install: the progressbar reports 42% inside the polite live region. */
export const Default: Story = {
  args: {
    percent: 42,
    caption: 'Downloading yt-dlp... 42%',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const status = canvas.getByRole('status');
    await expect(status).toHaveAttribute('aria-live', 'polite');

    const bar = canvas.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '42');
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');

    await expect(canvas.getByText('Downloading yt-dlp... 42%')).toBeInTheDocument();
  },
};

/** Completed install: the progressbar pins to its max value. */
export const Complete: Story = {
  args: {
    percent: 100,
    caption: 'Installing... 100%',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(canvas.getByText('Installing... 100%')).toBeInTheDocument();
  },
};
