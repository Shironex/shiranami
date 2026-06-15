import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { OnboardingStepContext } from '../../stepContext';

import ToolsStep from './ToolsStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'tools',
        kanji: '取',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

/**
 * Onboarding step 02 · Tools. Offers to install the two optional download
 * helpers (yt-dlp + ffmpeg) over the existing settings download primitives —
 * never gating progress, since the step is fully skippable. The install flow is
 * desktop-only: outside Electron (the Storybook web preview) the step shows a
 * "desktop-only" notice in place of the helper rows.
 */
const meta: Meta<typeof ToolsStep> = {
  title: 'onboarding/ToolsStep',
  component: ToolsStep,
  parameters: {
    // The title is plain text and the desktop-only notice is a labelled
    // paragraph; no unlabelled interactive role renders in the web preview —
    // axe passes clean.
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
};

export default meta;

type Story = StoryObj<typeof ToolsStep>;

/** Web preview — title plus the desktop-only install notice. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Pull tracks straight in.' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('Download helpers')).toBeInTheDocument();
    // The Storybook web preview is non-Electron, so the install flow degrades to
    // a desktop-only notice instead of the live helper rows.
    await expect(
      canvas.getByText('Downloading is available in the desktop app.')
    ).toBeInTheDocument();
  },
};
