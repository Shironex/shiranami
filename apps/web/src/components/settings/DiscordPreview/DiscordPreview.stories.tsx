import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import DiscordPreview from './DiscordPreview';

/**
 * settings · DiscordPreview. A presentational Discord rich-presence card adapted
 * for the now-playing context. Props drive what shows: the "Shiranami" app name
 * is always present, `details`/`state` are conditional text lines, `showTimestamp`
 * reveals the "03:42 left" elapsed line, `showLargeImage` the cover tile, and
 * `showButton` the "Get Shiranami" CTA. The "Listening to music" header is fixed.
 */
const meta: Meta<typeof DiscordPreview> = {
  title: 'settings/DiscordPreview',
  component: DiscordPreview,
  // Plain presentational text card — no interactive controls or unnamed widgets;
  // axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiscordPreview>;

/** Full — details, state, elapsed time, and the landing button all render. */
export const Default: Story = {
  args: {
    details: 'Midnight Tapes',
    state: 'Idealism',
    showTimestamp: true,
    showLargeImage: true,
    showButton: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Listening to music')).toBeInTheDocument();
    await expect(canvas.getByText('Shiranami')).toBeInTheDocument();
    await expect(canvas.getByText('Midnight Tapes')).toBeInTheDocument();
    await expect(canvas.getByText('Idealism')).toBeInTheDocument();
    await expect(canvas.getByText('03:42 left')).toBeInTheDocument();
    await expect(canvas.getByText('Get Shiranami')).toBeInTheDocument();
  },
};

/** Minimal — empty state plus all flags off hides every optional line. */
export const Minimal: Story = {
  args: {
    details: 'Midnight Tapes',
    state: '',
    showTimestamp: false,
    showLargeImage: false,
    showButton: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Midnight Tapes')).toBeInTheDocument();
    // Empty state, hidden timestamp, and hidden button drop their text.
    await expect(canvas.queryByText('Idealism')).not.toBeInTheDocument();
    await expect(canvas.queryByText('03:42 left')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Get Shiranami')).not.toBeInTheDocument();
  },
};
