import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import EnrichConfidenceBadge from './EnrichConfidenceBadge';

/**
 * settings · EnrichConfidenceBadge. A tiny pill that surfaces how confident a
 * metadata match is, mapping the raw 0–1 score to a coarse level (≥0.8 Strong,
 * ≥0.5 Likely, else Low) and a localized label. Renders nothing when the score
 * is null/undefined, so callers can drop the badge entirely for unscored matches.
 */
const meta: Meta<typeof EnrichConfidenceBadge> = {
  title: 'settings/EnrichConfidenceBadge',
  component: EnrichConfidenceBadge,
  parameters: {
    // The badge is a plain text pill with sufficient token-backed contrast and
    // no interactive elements — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex items-center gap-2 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** A high score (≥0.8) resolves to the "Strong match" tier. */
export const Default: Story = {
  args: { confidence: 0.92 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Strong match')).toBeInTheDocument();
  },
};

/** A mid score (0.5–0.8) resolves to the "Likely match" tier. */
export const Medium: Story = {
  args: { confidence: 0.6 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Likely match')).toBeInTheDocument();
  },
};

/** A low score (<0.5) resolves to the "Low match" tier. */
export const Low: Story = {
  args: { confidence: 0.3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Low match')).toBeInTheDocument();
  },
};

/** No score — the badge renders nothing at all. */
export const NoScore: Story = {
  args: { confidence: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // None of the tier labels appear when the score is absent.
    await expect(canvas.queryByText('Strong match')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Likely match')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Low match')).not.toBeInTheDocument();
  },
};
