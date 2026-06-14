import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof SummaryStep> = {
  title: 'onboarding/SummaryStep',
  component: SummaryStep,
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

type Story = StoryObj<typeof SummaryStep>;

export const Default: Story = {};
