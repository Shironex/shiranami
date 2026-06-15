import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { EnrichProgress } from '@shiranami/contracts';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';

import EnrichProgressBar from './EnrichProgressBar';

/** Seed the enrich store so the (otherwise hidden) progress panel renders. */
function seed(progress: EnrichProgress, isCancelling = false): void {
  useMetadataEnrichStore.setState({ isEnriching: true, isCancelling, progress });
}

/** Restore the runtime-only fields so each story renders from a clean baseline. */
function resetEnrichRuntime(): void {
  useMetadataEnrichStore.setState({ isEnriching: false, isCancelling: false, progress: null });
}

/**
 * settings · EnrichProgressBar. An isolated, high-frequency subscriber that
 * shows live per-track progress during a bulk metadata run. It renders only
 * while a run is active and progress exists — a `role="status"` polite live
 * region with the "Processing N of M" line, a per-track status line that varies
 * by phase (searching / downloading / writing / done / error / cancelled), and
 * an aria-hidden visual bar. Stories seed the `useMetadataEnrichStore` mirror.
 */
const meta: Meta<typeof EnrichProgressBar> = {
  title: 'settings/EnrichProgressBar',
  component: EnrichProgressBar,
  parameters: {
    // The panel is a labelled status region with plain text; the bar fill is
    // aria-hidden and icons are aria-hidden — axe clean.
    a11y: { test: 'error' },
  },
  beforeEach: resetEnrichRuntime,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Searching phase — the status region shows the count and the searched track. */
export const Searching: Story = {
  decorators: [
    Story => {
      seed({ current: 3, total: 12, trackName: 'feels.mp3', status: 'searching' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('status');
    await expect(within(status).getByText('Processing 3 of 12...')).toBeInTheDocument();
    await expect(within(status).getByText('Searching for "feels.mp3"...')).toBeInTheDocument();
  },
};

/** Done phase — the matched track name plus a confidence badge are shown. */
export const Done: Story = {
  decorators: [
    Story => {
      seed({
        current: 8,
        total: 12,
        trackName: 'Modal Soul',
        status: 'done',
        confidence: 0.92,
        source: 'itunes',
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('status');
    await expect(within(status).getByText('Processing 8 of 12...')).toBeInTheDocument();
    await expect(within(status).getByText('Modal Soul')).toBeInTheDocument();
    // The 0.92 score resolves to the high "Strong match" confidence tier.
    await expect(within(status).getByText('Strong match')).toBeInTheDocument();
  },
};

/** Cancelling — the in-flight cancellation note appears beneath the bar. */
export const Cancelling: Story = {
  decorators: [
    Story => {
      seed({ current: 5, total: 12, trackName: 'feels.mp3', status: 'searching' }, true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Cancelling...')).toBeInTheDocument();
  },
};
