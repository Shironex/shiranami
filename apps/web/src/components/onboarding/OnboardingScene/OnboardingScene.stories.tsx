import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import OnboardingScene from './OnboardingScene';

/**
 * onboarding · OnboardingScene. The rainy-window backdrop behind the wizard,
 * composed from three static splash layers — the night scene (skyline, moon,
 * flickering window lights), the clinging droplets, and the wet glass film. The
 * splash's rain canvas, steam and lamp are deliberately left out because the
 * wizard is a long-lived overlay. Its only input is `reducedMotion`, which
 * freezes the window-light flicker; both states get a story.
 */
const meta: Meta<typeof OnboardingScene> = {
  title: 'onboarding/OnboardingScene',
  component: OnboardingScene,
  parameters: {
    // Every layer is aria-hidden CSS/SVG decoration — no roles, names, or text
    // reach the a11y tree, so axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative h-[36rem] w-full overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OnboardingScene>;

/** Motion allowed — the distant window lights flicker over the static layers. */
export const Default: Story = {
  args: { reducedMotion: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('.splash-light')).toHaveLength(15);
    await expect(canvasElement.querySelectorAll('.splash-streak')).toHaveLength(5);
    await expect(canvasElement.querySelector('.splash-glass-blur')).not.toBeNull();

    const flickering = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('.splash-light')
    ).filter(light => light.style.animation !== '');
    await expect(flickering).toHaveLength(15);

    // The backdrop contributes nothing to the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** Reduced motion / low-perf — the same composition with the flicker frozen. */
export const ReducedMotion: Story = {
  args: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.splash-light')).toHaveLength(15);

    const flickering = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('.splash-light')
    ).filter(light => light.style.animation !== '');
    await expect(flickering).toHaveLength(0);
  },
};
