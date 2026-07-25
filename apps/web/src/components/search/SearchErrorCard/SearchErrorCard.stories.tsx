import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SearchErrorCard from './SearchErrorCard';

/**
 * search · SearchErrorCard. The full-bleed failure card SearchView shows when a
 * YouTube search rejects: the dimmed mascot behind a destructive alert badge,
 * the localized "no results" heading, and the raw yt-dlp failure message.
 * Purely presentational — `error` in, card out.
 */
const meta: Meta<typeof SearchErrorCard> = {
  title: 'search/SearchErrorCard',
  component: SearchErrorCard,
  parameters: {
    // The mascot is decorative (alt="" + aria-hidden), the alert badge is a bare
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

type Story = StoryObj<typeof SearchErrorCard>;

/** A short transport failure — heading plus the message. */
export const Default: Story = {
  args: {
    error: 'Network timeout',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('No results found. Try a different search term.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('Network timeout')).toBeInTheDocument();
  },
};

/** A verbose yt-dlp failure — the message wraps inside the narrow copy column. */
export const LongError: Story = {
  args: {
    error:
      'ERROR: unable to download webpage: HTTP Error 429: Too Many Requests. Wait a few minutes and try the search again.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/HTTP Error 429/)).toBeInTheDocument();
  },
};
