import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { OnboardingStepContext } from '../../stepContext';

import FoldersStep from './FoldersStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'folders',
        kanji: '蔵',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

const meta: Meta<typeof FoldersStep> = {
  title: 'onboarding/FoldersStep',
  component: FoldersStep,
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

type Story = StoryObj<typeof FoldersStep>;

export const Default: Story = {};
