import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useThemeStore } from '@/stores/useThemeStore';
import { useUIStore } from '@/stores/useUIStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { OnboardingStepContext } from '../../stepContext';

import SummaryStep from './SummaryStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'summary',
        kanji: '締',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

/**
 * Onboarding step 07 · Summary. A read-only recap that reads every choice back
 * from the same stores/queries each prior step wrote to (theme, visualizer,
 * playback, telemetry, folders), rendered as a labelled list of icon · label ·
 * value rows. Adds no actions — finishing lives in the wizard chrome. Stories
 * seed the stores so the recap values are deterministic.
 */
const meta: Meta<typeof SummaryStep> = {
  title: 'onboarding/SummaryStep',
  component: SummaryStep,
  parameters: {
    // The recap is a labelled `role="list"` of `role="listitem"` rows; every row
    // icon is wrapped in an aria-hidden span — axe passes clean.
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
    useThemeStore.setState({ theme: 'none' });
    useUIStore.setState({ visualizerStyle: 'bars' });
    usePlaybackStore.setState({ crossfadeEnabled: false });
    useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
  },
};

export default meta;

type Story = StoryObj<typeof SummaryStep>;

/** Default recap — one labelled row per choice, in a labelled list. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Your room is ready.' })).toBeInTheDocument();

    const list = canvas.getByRole('list', { name: 'Your setup choices' });
    await expect(list).toBeInTheDocument();
    await expect(within(list).getByText('Theme')).toBeInTheDocument();
    await expect(within(list).getByText('Crash reports')).toBeInTheDocument();
  },
};

/** Seeded choices flow through to their recap values. */
export const ReflectsChoices: Story = {
  beforeEach: () => {
    useThemeStore.setState({ theme: 'snow' });
    usePlaybackStore.setState({ crossfadeEnabled: true, crossfadeDuration: 6 });
    useTelemetryStore.setState({ enabled: true, performanceEnabled: true });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Snow')).toBeInTheDocument();
    await expect(canvas.getByText(/Crossfade 6s/)).toBeInTheDocument();
    await expect(canvas.getByText('On · performance')).toBeInTheDocument();
  },
};
