import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { Palette, ShieldCheck } from 'lucide-react';

import SummaryRow from './SummaryRow';

/**
 * onboarding · SummaryRow. One read-only recap line on the wizard's final step:
 * a decorative glyph, the setting's label, and the choice the user made in
 * right-aligned mono. `highlight` accents the value in the primary color for
 * choices worth calling out (folders added, crash reporting enabled). Not
 * interactive — it is a `listitem` inside the Summary step's labelled list, so
 * the stories render it in that list context.
 */
const meta: Meta<typeof SummaryRow> = {
  title: 'onboarding/SummaryRow',
  component: SummaryRow,
  parameters: {
    // The row is a listitem inside a labelled list and its glyph is aria-hidden,
    // so nothing unlabelled or orphaned reaches the a11y tree — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div role="list" aria-label="Your setup choices" className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SummaryRow>;

/** Default tint — the value sits in the plain foreground color. */
export const Default: Story = {
  args: {
    icon: <Palette />,
    label: 'Theme',
    value: 'SNOW',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const item = canvas.getByRole('listitem');
    await expect(within(item).getByText('Theme')).toBeInTheDocument();
    await expect(within(item).getByText('SNOW')).toHaveClass('text-foreground');
  },
};

/** Highlighted — the accent tint marks a choice worth calling out. */
export const Highlighted: Story = {
  args: {
    icon: <ShieldCheck />,
    label: 'Crash reports',
    value: 'ON',
    highlight: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const value = canvas.getByText('ON');
    await expect(value).toHaveClass('text-primary');
    await expect(value).not.toHaveClass('text-foreground');
  },
};
