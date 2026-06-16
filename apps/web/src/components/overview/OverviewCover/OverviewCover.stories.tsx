import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import OverviewCover from './OverviewCover';

/**
 * overview · OverviewCover. Cover art for Overview rows and cards. With album
 * art it renders a labelled `<img>` (alt = the title); without it, a
 * deterministic theme-tinted gradient + a representative glyph stand in — that
 * fallback layer is decorative and `aria-hidden`, so it never reaches the a11y
 * tree. The glyph prefers the first CJK character in the seed, else a hashed
 * pick. Stories assert the labelled image vs. the decorative-glyph fallback.
 */
const meta: Meta<typeof OverviewCover> = {
  title: 'overview/OverviewCover',
  component: OverviewCover,
  parameters: {
    // The fallback gradient + glyph are wrapped in an aria-hidden layer; the
    // real-art variant exposes a single alt-labelled <img> — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="size-24">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OverviewCover>;

/** No album art — the decorative gradient + a hashed glyph (no image in the a11y tree). */
export const Fallback: Story = {
  args: {
    title: 'Midnight Tapes',
    seed: 'Idealism',
    className: 'size-24',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The fallback is decorative, so no labelled image is exposed.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
    // The decorative glyph layer is aria-hidden but still rendered with content.
    const fallback = canvasElement.querySelector('[aria-hidden="true"] span');
    await expect(fallback?.textContent?.length ?? 0).toBeGreaterThan(0);
  },
};

/** CJK seed — the glyph prefers the first CJK character ("夜") from the seed. */
export const CjkSeed: Story = {
  args: {
    title: '夜のしらべ',
    seed: '夜のしらべ',
    className: 'size-24',
  },
  play: async ({ canvasElement }) => {
    const glyph = canvasElement.querySelector('[aria-hidden="true"] span');
    await expect(glyph?.textContent).toBe('夜');
  },
};

/** Real album art — a single image labelled by its title. */
export const WithArt: Story = {
  args: {
    title: 'Midnight Tapes',
    seed: 'Idealism',
    albumArt: 'https://placehold.co/96x96/png',
    className: 'size-24',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Midnight Tapes' })).toBeInTheDocument();
  },
};
