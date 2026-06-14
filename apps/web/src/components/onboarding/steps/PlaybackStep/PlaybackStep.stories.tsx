import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof PlaybackStep> = {
  title: 'onboarding/PlaybackStep',
  component: PlaybackStep,
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

type Story = StoryObj<typeof PlaybackStep>;

export const Default: Story = {};
