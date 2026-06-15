import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import OnboardingStepLayout from './OnboardingStepLayout';

/**
 * Two-pane magazine split shared by every onboarding step: a narrative left pane
 * (kanji watermark + mono eyebrow + serif headline + body copy) and an
 * interactive right pane that hosts the real step control. Pure presentation —
 * the headline renders as the labelled `<h2>` the wizard moves focus to via
 * `headingId`/`headingRef`.
 */
const meta: Meta<typeof OnboardingStepLayout> = {
  title: 'onboarding/OnboardingStepLayout',
  component: OnboardingStepLayout,
  parameters: {
    // Headline is a real <h2> (named), the eyebrow + body are plain text, and the
    // scrim/kanji watermark are aria-hidden — nothing here carries an unlabelled
    // interactive role, so axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="h-[36rem] w-full">
        <Story />
      </div>
    ),
  ],
  args: {
    kanji: '蔵',
    stepMarker: '01 · POINT IT AT YOUR FILES',
    headline: 'Point Shiranami at your music.',
    description: 'Add the folders that hold your library and it scans them on the spot.',
    children: (
      <div className="rounded-xl border border-dashed border-border/40 py-8 text-center text-sm text-muted-foreground">
        Step control goes here
      </div>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof OnboardingStepLayout>;

/** Eyebrow, headline, body copy, and the placeholder right-pane control. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Point Shiranami at your music.' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('01 · POINT IT AT YOUR FILES')).toBeInTheDocument();
    await expect(canvas.getByText('Step control goes here')).toBeInTheDocument();
  },
};

/** Passing `headingId` wires the heading so the wizard can move focus to it. */
export const WithHeadingId: Story = {
  args: { headingId: 'onboarding-step-heading' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Point Shiranami at your music.' })
    ).toHaveAttribute('id', 'onboarding-step-heading');
  },
};
