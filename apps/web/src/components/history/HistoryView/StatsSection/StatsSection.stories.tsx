import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { BarChart3, Clock3 } from 'lucide-react';

import StatsSection from './StatsSection';

/**
 * history · StatsSection. The section-card chrome every History panel shares:
 * a `<section>` wired to its `<h2>` via `aria-labelledby`, a decorative icon,
 * an optional caption, and the panel body as children. The default `panel`
 * variant is the quiet glass card; the `hero` variant promotes one section —
 * the activity graph — into the page's focal panel with a primary-tinted
 * border, radial wash, icon chip, and a larger heading.
 */
const meta: Meta<typeof StatsSection> = {
  title: 'history/StatsSection',
  component: StatsSection,
  parameters: {
    // A labelled region with a real <h2> and a decorative icon — axe passes
    // clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[36rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatsSection>;

/** The quiet section-card chrome shared by the list panels. */
export const Panel: Story = {
  args: {
    title: 'Recent Plays',
    icon: Clock3,
    children: <p className="mt-4 text-sm text-muted-foreground">Rows render here.</p>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const region = canvas.getByRole('region', { name: 'Recent Plays' });
    const heading = canvas.getByRole('heading', { level: 2, name: 'Recent Plays' });
    await expect(region).toHaveAttribute('aria-labelledby', heading.id);
  },
};

/** The promoted focal panel used by the activity graph. */
export const Hero: Story = {
  args: {
    title: 'Activity',
    icon: BarChart3,
    caption: 'Plays per day across the selected range.',
    variant: 'hero',
    children: <div className="mt-5 h-32 rounded-2xl bg-background/30" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const region = canvas.getByRole('region', { name: 'Activity' });
    await expect(region.className).toContain('border-primary/20');
    await expect(canvas.getByText('Plays per day across the selected range.')).toBeInTheDocument();
  },
};
