import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn, waitFor } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

import OnboardingWizard from './OnboardingWizard';

/**
 * First-run setup wizard — a full-window (`fixed inset-0`) modal dialog shown
 * once on a user's first launch. It walks eight skippable steps (welcome →
 * folders → tools → appearance → playback → visualizer → privacy → summary)
 * behind a rainy-window backdrop, with a Skip control, clickable progress dots
 * (with `aria-current`), and a Back/Next-or-finish CTA. Each step reads its own
 * Zustand store/query at default state, so the whole flow renders without a
 * backend.
 *
 * Stories seed `lowPerformanceMode` so the entrance/exit animations are skipped
 * and the finish completion flag flips synchronously, and reset
 * `useOnboardingStore` so each run observes a real completion.
 */
const meta: Meta<typeof OnboardingWizard> = {
  title: 'onboarding/OnboardingWizard',
  component: OnboardingWizard,
  parameters: {
    layout: 'fullscreen',
    // The dialog is aria-labelled, every nav control is a named button, and the
    // progress dots form a labelled group with aria-current — axe passes clean.
    a11y: { test: 'error' },
  },
  args: { onComplete: fn() },
  argTypes: {
    onComplete: {
      description:
        'Called once the user finishes (or skips) onboarding, after the exit animation; the parent typically unmounts the wizard here.',
    },
  },
  beforeEach: () => {
    // Seed every store the flow reads at entry so the wizard renders from a known
    // state regardless of run order; cross-story theme/background isolation is
    // handled centrally in `.storybook/preview.tsx`. lowPerformanceMode skips the
    // entrance/exit motion so finishing completes synchronously.
    useUIStore.setState({ lowPerformanceMode: true });
    usePlaybackStore.setState({ crossfadeEnabled: false });
    useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
    useOnboardingStore.setState({ hasCompletedOnboarding: false });
  },
};

export default meta;

type Story = StoryObj<typeof OnboardingWizard>;

/** Opens on the welcome step with Skip + Next and the eight-dot progress rail. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('dialog', { name: 'First-run setup' })).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'A softer place for your music library.' })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    await expect(canvas.getAllByRole('button', { name: /Go to step/ })).toHaveLength(8);
  },
};

/** Driving Next advances to the folders step and reveals the Back control. */
export const AdvancesToNextStep: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));

    await expect(
      canvas.getByRole('heading', { name: 'Your folders are the catalog.' })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    // Back returns to the welcome step.
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
    await expect(
      canvas.getByRole('heading', { name: 'A softer place for your music library.' })
    ).toBeInTheDocument();
  },
};

/**
 * Finishing from the summary step marks onboarding complete and fires
 * `onComplete` (synchronously, since motion is disabled).
 */
export const FinishesOnboarding: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Jump straight to the summary step via its progress dot.
    await userEvent.click(canvas.getByRole('button', { name: 'Go to step 8: summary' }));
    await expect(canvas.getByRole('heading', { name: 'Your room is ready.' })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Open library' }));
    await waitFor(() => expect(args.onComplete).toHaveBeenCalledTimes(1));
    await expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  },
};
