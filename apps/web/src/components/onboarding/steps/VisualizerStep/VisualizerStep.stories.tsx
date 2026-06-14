import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { OnboardingStepContext } from '../../stepContext';

import VisualizerStep from './VisualizerStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'visualizer',
        kanji: '波',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

const meta: Meta<typeof VisualizerStep> = {
  title: 'onboarding/VisualizerStep',
  component: VisualizerStep,
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

type Story = StoryObj<typeof VisualizerStep>;

export const Default: Story = {};
