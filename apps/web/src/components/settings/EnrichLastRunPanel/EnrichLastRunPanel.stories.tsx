import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useMetadataEnrichStore, type EnrichLastRunEntry } from '@/stores/useMetadataEnrichStore';

import EnrichLastRunPanel from './EnrichLastRunPanel';

/** Seed the store with a finished run so the (otherwise hidden) panel renders. */
function seed(results: EnrichLastRunEntry[]): void {
  useMetadataEnrichStore.setState({ isEnriching: false, lastRunResults: results });
}

/** Restore runtime-only fields so each story renders from a clean baseline. */
function resetEnrichRuntime(): void {
  useMetadataEnrichStore.setState({ isEnriching: false, lastRunResults: [] });
}

const SAMPLE: EnrichLastRunEntry[] = [
  {
    id: 'track-1',
    trackName: 'Modal Soul',
    source: 'itunes',
    confidence: 0.92,
    success: true,
    diffs: [
      { field: 'artist', oldValue: 'Unknown Artist', newValue: 'Nujabes' },
      { field: 'album', oldValue: null, newValue: 'Modal Soul' },
    ],
  },
  {
    id: 'track-2',
    trackName: 'feels.mp3',
    source: 'none',
    success: false,
    error: 'No metadata found',
    diffs: [],
  },
];

/**
 * settings · EnrichLastRunPanel. The in-memory post-run report for the bulk
 * enrichment feature — a collapsible summary of the last run's per-track
 * results (what changed, what matched, what failed). Visible only when a
 * finished run with results exists and none is in flight. The header button
 * carries `aria-expanded`; the per-track diff rows mount only when expanded.
 * Stories seed the `useMetadataEnrichStore` snapshot the run collected.
 */
const meta: Meta<typeof EnrichLastRunPanel> = {
  title: 'settings/EnrichLastRunPanel',
  component: EnrichLastRunPanel,
  parameters: {
    // The toggle is a real <button> with aria-expanded and visible text; diff
    // images are decorative (alt=""); status icons are aria-hidden — axe clean.
    a11y: { test: 'error' },
  },
  beforeEach: resetEnrichRuntime,
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Collapsed by default; expanding reveals the per-track diff for the run. */
export const Default: Story = {
  decorators: [
    Story => {
      seed(SAMPLE);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Header shows the title + the "changed of total" summary (1 of 2 changed).
    await expect(canvas.getByText('View last run')).toBeInTheDocument();
    await expect(canvas.getByText('1 of 2 tracks changed')).toBeInTheDocument();

    // Starts collapsed — the body and its diff rows are not mounted.
    const toggle = canvas.getByRole('button', { name: /View last run/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByText('Nujabes')).not.toBeInTheDocument();

    // Expanding mounts the per-track entries and their field diffs.
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    await expect(canvas.getByText('Nujabes')).toBeInTheDocument();
    // The failed entry surfaces its no-match copy.
    await expect(canvas.getByText('No matching metadata found.')).toBeInTheDocument();
  },
};
