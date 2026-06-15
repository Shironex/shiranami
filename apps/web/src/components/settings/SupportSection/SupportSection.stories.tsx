import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SupportSection from './SupportSection';

/**
 * settings · SupportSection. A static "support the project" card: a real `<h3>`
 * heading ("Support"), three explanatory paragraphs, and two external CTA links
 * — "Buy me a coffee" and "Sponsor on GitHub" — both opening in a new tab with
 * `rel="noopener noreferrer"` and marking the support banner as seen on click.
 * Lucide glyphs inside the links are decorative. No props or store seeding
 * needed; the section reads only static constants.
 */
const meta: Meta<typeof SupportSection> = {
  title: 'settings/SupportSection',
  component: SupportSection,
  parameters: {
    // Real heading, named external links carrying rel=noopener noreferrer, and
    // decorative lucide icons inside the links — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SupportSection>;

/** Both CTA links render, named and pointing at external, safely-targeted URLs. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Support' })).toBeInTheDocument();

    const coffee = canvas.getByRole('link', { name: /Buy me a coffee/ });
    const sponsor = canvas.getByRole('link', { name: /Sponsor on GitHub/ });
    await expect(coffee).toBeInTheDocument();
    await expect(sponsor).toBeInTheDocument();

    // External CTAs open in a new tab and must be reverse-tabnabbing safe.
    await expect(coffee).toHaveAttribute('target', '_blank');
    await expect(coffee).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(sponsor).toHaveAttribute('rel', 'noopener noreferrer');
  },
};
