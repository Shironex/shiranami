import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import StationRowSkeleton, { RADIO_SKELETON_ROWS } from './StationRowSkeleton';

const loadingRows = Array.from({ length: RADIO_SKELETON_ROWS }, (_, index) => (
  <StationRowSkeleton key={`station-skeleton-${index}`} />
));

/**
 * radio · StationRowSkeleton. The placeholder that stands in for a `StationRow`
 * while the radio-browser directory loads: six pulsing bars laid out on the same
 * 52px grid as the real row — favicon, name, tags, country flag, codec badge and
 * play affordance — so the list never reflows when data lands. The country/codec
 * pair stays hidden below the `sm` breakpoint, matching `StationRow`.
 *
 * Non-interactive by design, so there is nothing to drive: the stories show its
 * two real appearances — the single row, and the `RADIO_SKELETON_ROWS`-tall
 * stack RadioView actually renders — and assert their placeholder structure.
 */
const meta: Meta<typeof StationRowSkeleton> = {
  title: 'radio/StationRowSkeleton',
  component: StationRowSkeleton,
  parameters: {
    // Pure pulsing <div>s — no roles, names, or text reach the a11y tree, so axe
    // passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StationRowSkeleton>;

/** One placeholder row — the six bars of a station row, and no text. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
    await expect(canvasElement.querySelector('.h-\\[52px\\]')).not.toBeNull();
    await expect(canvasElement.textContent).toBe('');
  },
};

/** The loading list RadioView renders — `RADIO_SKELETON_ROWS` stacked rows. */
export const LoadingList: Story = {
  render: () => <div className="space-y-1">{loadingRows}</div>,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      RADIO_SKELETON_ROWS * 6
    );
  },
};
