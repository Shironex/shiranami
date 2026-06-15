import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { OnboardingStepContext } from '../../stepContext';

import PrivacyStep from './PrivacyStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'privacy',
        kanji: '守',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

/**
 * Onboarding step 06 · Crash reports. A consent surface that discloses exactly
 * what is and isn't sent, then offers an off-by-default crash-reporting switch.
 * Enabling it reveals a nested performance-monitoring switch (a sub-option that
 * only sends data while reporting is on). Both toggles read/write
 * `useTelemetryStore`; stories seed it so the disclosure state is deterministic.
 */
const meta: Meta<typeof PrivacyStep> = {
  title: 'onboarding/PrivacyStep',
  component: PrivacyStep,
  parameters: {
    // Each toggle is a Radix switch labelled via aria-labelledby; the check/x
    // glyphs beside the disclosure rows are decorative SVGs — axe passes clean.
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
    useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
  },
};

export default meta;

type Story = StoryObj<typeof PrivacyStep>;

/** Reporting off — only the single crash-reports switch, no performance toggle. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Help fix what breaks.' })
    ).toBeInTheDocument();
    await expect(canvas.getByText("What's sent")).toBeInTheDocument();
    await expect(canvas.getByText("What's never sent")).toBeInTheDocument();

    const toggles = canvas.getAllByRole('switch');
    expect(toggles).toHaveLength(1);
    await expect(toggles[0]).not.toBeChecked();
  },
};

/** Enabling crash reports flips the store and reveals the performance sub-toggle. */
export const EnablesReporting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: 'Send crash reports' }));

    await waitFor(() => expect(useTelemetryStore.getState().enabled).toBe(true));
    // Performance monitoring only appears once reporting is on.
    await expect(
      canvas.getByRole('switch', { name: 'Performance monitoring' })
    ).toBeInTheDocument();
  },
};

/** Reporting already on — both switches present, performance still off. */
export const ReportingOn: Story = {
  beforeEach: () => {
    useTelemetryStore.setState({ enabled: true, performanceEnabled: false });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Send crash reports' })).toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Performance monitoring' })).not.toBeChecked();
  },
};
