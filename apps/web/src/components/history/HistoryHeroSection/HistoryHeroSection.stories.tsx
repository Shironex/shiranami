import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { HistoryRange } from '@/components/history/historyUtils';

import HistoryHeroSection from './HistoryHeroSection';

/** Stateful harness so the range pills toggle live in the story. */
function HistoryHeroSectionHarness() {
  const [range, setRange] = useState<HistoryRange>('all');
  return <HistoryHeroSection selectedRange={range} onRangeChange={setRange} />;
}

const meta: Meta<typeof HistoryHeroSection> = {
  title: 'history/HistoryHeroSection',
  component: HistoryHeroSection,
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

export const Default: Story = {
  render: () => <HistoryHeroSectionHarness />,
};
