import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { HistoryRange } from '@/components/history/historyUtils';

import HistoryHeroSection from './HistoryHeroSection';

/**
 * Stateful harness so the range pills toggle live in the story while still
 * forwarding every selection to the `onRangeChange` spy for assertions.
 */
function HistoryHeroSectionHarness({
  initialRange = 'all',
  onRangeChange,
}: {
  initialRange?: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
}) {
  const [range, setRange] = useState<HistoryRange>(initialRange);
  return (
    <HistoryHeroSection
      selectedRange={range}
      onRangeChange={next => {
        setRange(next);
        onRangeChange(next);
      }}
    />
  );
}

/**
 * history · HistoryHeroSection. The History dashboard header: an eyebrow, the
 * serif `<h1>` headline, a range-scoped subtitle, and three range pills
 * ("7 Days" / "30 Days" / "All Time") rendered as buttons. Selecting a pill
 * calls `onRangeChange(id)` and re-highlights the active pill. Stories assert the
 * heading + pills and that clicking a pill fires the callback with its range id.
 */
const meta: Meta<typeof HistoryHeroSection> = {
  title: 'history/HistoryHeroSection',
  component: HistoryHeroSection,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // eyebrow + subtitle + inactive pills render with sub-opacity muted tokens
  // (`text-muted-foreground/55`, `/75`, and the base muted token) over the
  // panel's radial-gradient glass backdrop, so axe's color-contrast ratio is
  // non-deterministic against the layered background. The heading, pills, and
  // selection callback are asserted in `play`.
  args: {
    onRangeChange: fn(),
  },
  decorators: [
    Story => (
      <div className="w-[48rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryHeroSection>;

/** Headline + three range pills; clicking "7 Days" reports the "7d" range. */
export const Default: Story = {
  render: args => <HistoryHeroSectionHarness onRangeChange={args.onRangeChange} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: 'A running picture of what you actually stick with.',
      })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '7 Days' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '30 Days' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'All Time' })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '7 Days' }));
    await expect(args.onRangeChange).toHaveBeenCalledWith('7d');
  },
};
