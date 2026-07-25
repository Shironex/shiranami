import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SearchingCard from './SearchingCard';

/**
 * search · SearchingCard. The full-bleed "search in flight" card SearchView
 * shows while yt-dlp is querying YouTube: the floating mascot with a spinning
 * badge, the "Searching YouTube" heading, and a subtitle echoing the trimmed
 * query. Purely presentational — `query` in, card out.
 */
const meta: Meta<typeof SearchingCard> = {
  title: 'search/SearchingCard',
  component: SearchingCard,
  parameters: {
    // The mascot is decorative (alt="" + aria-hidden), the spinner is a bare
    // lucide glyph, and the copy is plain text — axe passes clean.
    a11y: { test: 'error' },
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

type Story = StoryObj<typeof SearchingCard>;

/** A typical in-flight search — heading plus the echoed query. */
export const Default: Story = {
  args: {
    query: 'lofi beats',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Searching YouTube')).toBeInTheDocument();
    await expect(canvas.getByText('Pulling the best matches for "lofi beats"')).toBeInTheDocument();
  },
};

/** Whitespace-padded input — the subtitle renders the trimmed query. */
export const UntrimmedQuery: Story = {
  args: {
    query: '   rainy jazz   ',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Pulling the best matches for "rainy jazz"')).toBeInTheDocument();
  },
};

/** A long query — the subtitle wraps inside the fixed-width card. */
export const LongQuery: Story = {
  args: {
    query: 'slow rainy evening piano study session with vinyl crackle and distant thunder',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/slow rainy evening piano study session/)).toBeInTheDocument();
  },
};
