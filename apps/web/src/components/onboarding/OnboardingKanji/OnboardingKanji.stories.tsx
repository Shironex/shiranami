import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import OnboardingKanji from './OnboardingKanji';

/**
 * onboarding · OnboardingKanji. The oversized kanji wash behind each step's
 * narrative pane — one glyph per step (白波 welcome, 蔵 folders, 夜 appearance,
 * 波 visualizer…), drawn from `--primary` at 5% alpha. It has no interactive
 * surface, so the stories cover its real variants instead: the two-character
 * brand glyph and a single-character step glyph, each verified to stay out of
 * the accessibility tree.
 */
const meta: Meta<typeof OnboardingKanji> = {
  title: 'onboarding/OnboardingKanji',
  component: OnboardingKanji,
  parameters: {
    // The glyph is CSS generated content inside an aria-hidden span, so no text
    // reaches the a11y tree and axe's color-contrast rule has nothing to measure.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative flex h-[28rem] w-full items-center justify-center overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OnboardingKanji>;

/** The welcome step's two-character brand glyph. */
export const Default: Story = {
  args: { glyph: '白波' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-kanji="白波"]')).not.toBeNull();
    // Painted via ::before, so it is never a text node in the a11y tree.
    await expect(canvas.queryByText('白波')).not.toBeInTheDocument();
  },
};

/** A single-character step glyph — the shape most steps use. */
export const SingleCharacter: Story = {
  args: { glyph: '蔵' },
  play: async ({ canvasElement }) => {
    const watermark = canvasElement.querySelector('[data-kanji="蔵"]');
    await expect(watermark).not.toBeNull();
    await expect(watermark).toHaveAttribute('aria-hidden', 'true');
  },
};
