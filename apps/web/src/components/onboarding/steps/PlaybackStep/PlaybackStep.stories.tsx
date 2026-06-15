import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { OnboardingStepContext } from '../../stepContext';

import PlaybackStep from './PlaybackStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'playback',
        kanji: '音',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

/**
 * Onboarding step 04 · Playback. Surfaces the three highest-value first-run
 * playback prefs — resume position, crossfade (with a duration slider that
 * appears only when on), and Discord Rich Presence (desktop-only). Resume and
 * Discord write through the settings query layer; crossfade reads/writes
 * `usePlaybackStore`. Stories seed the playback store so the crossfade section
 * is deterministic.
 */
const meta: Meta<typeof PlaybackStep> = {
  title: 'onboarding/PlaybackStep',
  component: PlaybackStep,
  parameters: {
    // Each preference is a Radix switch labelled via aria-labelledby; the
    // crossfade slider's accessible name is forwarded to its thumb (the
    // role="slider" element), so axe's aria-input-field-name passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <StepHost>
        <div className="h-[36rem] w-full">
          <Story />
        </div>
      </StepHost>
    ),
  ],
  beforeEach: () => {
    usePlaybackStore.setState({ crossfadeEnabled: false, crossfadeDuration: 5 });
  },
};

export default meta;

type Story = StoryObj<typeof PlaybackStep>;

/** Crossfade off — the duration slider is hidden until the toggle is on. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Set the flow of the room.' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('Resume where I left off')).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Crossfade tracks' })).not.toBeChecked();
    await expect(
      canvas.queryByRole('slider', { name: 'Crossfade length' })
    ).not.toBeInTheDocument();
  },
};

/** Toggling crossfade flips the store and reveals the duration slider. */
export const TogglesCrossfade: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: 'Crossfade tracks' }));

    await waitFor(() => expect(usePlaybackStore.getState().crossfadeEnabled).toBe(true));
    // The duration slider carries its accessible name on the thumb (role="slider").
    await expect(canvas.getByRole('slider', { name: 'Crossfade length' })).toBeInTheDocument();
  },
};

/** Crossfade pre-enabled — the labelled duration slider renders on mount. */
export const CrossfadeOn: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ crossfadeEnabled: true, crossfadeDuration: 8 });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Crossfade tracks' })).toBeChecked();
    await expect(canvas.getByRole('slider', { name: 'Crossfade length' })).toBeInTheDocument();
  },
};
