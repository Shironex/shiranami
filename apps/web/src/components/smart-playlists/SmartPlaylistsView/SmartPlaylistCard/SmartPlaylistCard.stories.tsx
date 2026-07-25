import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { SmartPlaylist } from '@shiranami/contracts';

import SmartPlaylistCard from './SmartPlaylistCard';

function makePlaylist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: 'sp-1',
    name: 'Late-night focus',
    description: null,
    matchType: 'all',
    rules: [{ field: 'genre', operator: 'is', value: 'lofi' }],
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

/**
 * smart-playlists · SmartPlaylistCard. One tile in the smart-playlists grid: a
 * sparkle badge, the playlist name, and a pluralized rule-count summary, all
 * inside a single full-width `<button>` that opens the playlist's detail view
 * via `onOpen(id)`. Presentational — the rule count is read straight from the
 * playlist, so the stories cover the singular/plural summary and the click
 * contract.
 */
const meta: Meta<typeof SmartPlaylistCard> = {
  title: 'smart-playlists/SmartPlaylistCard',
  component: SmartPlaylistCard,
  parameters: {
    // The card is one labelled <button> named by its text and the sparkle icon
    // is aria-hidden — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    playlist: makePlaylist(),
    onOpen: fn(),
  },
  decorators: [
    Story => (
      <div className="w-[22rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SmartPlaylistCard>;

/** A one-rule playlist — singular summary; clicking opens it by id. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole('button', { name: /Late-night focus/ });
    await expect(card).toHaveTextContent('1 rule');

    await userEvent.click(card);
    await expect(args.onOpen).toHaveBeenCalledWith('sp-1');
  },
};

/** Several rules — the summary pluralizes off the rule count. */
export const ManyRules: Story = {
  args: {
    playlist: makePlaylist({
      id: 'sp-2',
      name: 'Rainy day cafe',
      rules: [
        { field: 'genre', operator: 'is', value: 'lofi' },
        { field: 'playCount', operator: 'greaterThan', value: '5' },
        { field: 'year', operator: 'lessThan', value: '2020' },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Rainy day cafe/ })).toHaveTextContent(
      '3 rules'
    );
  },
};

/** A long name truncates rather than wrapping the card out of the grid. */
export const LongName: Story = {
  args: {
    playlist: makePlaylist({
      id: 'sp-3',
      name: 'Slow morning coffee, rain on the window, and nowhere to be',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByText(/Slow morning coffee/);
    await expect(name).toHaveClass('truncate');
  },
};
