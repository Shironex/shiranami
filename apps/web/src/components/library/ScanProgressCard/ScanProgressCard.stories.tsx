import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useLibraryStore } from '@/stores/useLibraryStore';

import ScanProgressCard from './ScanProgressCard';

/**
 * library · ScanProgressCard. The inline card shown in settings while a library
 * scan runs: a status line ("Scanning N of M…"), the current file, a determinate
 * progress bar, and a cancel button. It reads `scanState` + `scanProgress` from
 * `useLibraryStore` and renders nothing when idle. Stories seed the store to the
 * scanning and cancelling states and assert the progress bar value + cancel
 * control.
 */
const meta: Meta<typeof ScanProgressCard> = {
  title: 'library/ScanProgressCard',
  component: ScanProgressCard,
  parameters: {
    // ProgressBar exposes role="progressbar" with aria-valuenow, the cancel
    // button has a visible text label, and the spinner icons are decorative
    // SVGs — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[20rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ScanProgressCard>;

/** Mid-scan — progress at 35% with a live cancel button. */
export const Default: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        scanState: 'scanning',
        scanProgress: {
          fileIndex: 42,
          fileCount: 120,
          currentFile: 'Lofi beats/Midnight study session.flac',
        },
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 42 / 120 = 35%.
    const progress = canvas.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '35');
    await expect(canvas.getByText('Scanning 42 of 120...')).toBeInTheDocument();
    await expect(canvas.getByText('Lofi beats/Midnight study session.flac')).toBeInTheDocument();

    const cancel = canvas.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeEnabled();
  },
};

/** Cancellation in flight — the cancel button relabels and disables. */
export const Cancelling: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        scanState: 'cancelling',
        scanProgress: {
          fileIndex: 88,
          fileCount: 120,
          currentFile: 'Rainy day cafe/Slow morning coffee.flac',
        },
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cancel = canvas.getByRole('button', { name: 'Cancelling...' });
    await expect(cancel).toBeDisabled();
  },
};
