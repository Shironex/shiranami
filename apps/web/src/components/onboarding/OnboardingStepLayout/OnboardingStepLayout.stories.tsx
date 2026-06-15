import type { Meta, StoryObj } from '@storybook/react-vite';

import OnboardingStepLayout from './OnboardingStepLayout';

const meta: Meta<typeof OnboardingStepLayout> = {
  title: 'onboarding/OnboardingStepLayout',
  component: OnboardingStepLayout,
  decorators: [
    Story => (
      <div className="h-[36rem] w-full">
        <Story />
      </div>
    ),
  ],
  args: {
    kanji: '蔵',
    stepMarker: '01 · POINT IT AT YOUR FILES',
    headline: 'Point Shiranami at your music.',
    description: 'Add the folders that hold your library and it scans them on the spot.',
    children: (
      <div className="rounded-xl border border-dashed border-border/40 py-8 text-center text-sm text-muted-foreground">
        Step control goes here
      </div>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof OnboardingStepLayout>;

export const Default: Story = {};
