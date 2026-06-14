import type { Meta, StoryObj } from '@storybook/react-vite';

import OnboardingWizard from './OnboardingWizard';

const meta: Meta<typeof OnboardingWizard> = {
  title: 'onboarding/OnboardingWizard',
  component: OnboardingWizard,
  parameters: { layout: 'fullscreen' },
  args: {
    onComplete: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof OnboardingWizard>;

export const Default: Story = {};
