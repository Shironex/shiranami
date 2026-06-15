import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';
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

/**
 * Onboarding step 05 · Visualizer. A live, audio-free preview rides above a grid
 * of selectable visualizer styles (aria-pressed toggle buttons). Selecting a
 * style writes it to `useUIStore` and swaps the preview. Stories seed
 * `useUIStore.visualizerStyle` so the selected tile is deterministic.
 */
const meta: Meta<typeof VisualizerStep> = {
  title: 'onboarding/VisualizerStep',
  component: VisualizerStep,
  parameters: {
    // Each style tile is an aria-pressed button whose accessible name is its
    // visible label; the synthetic preview canvas is decorative — axe passes
    // clean.
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
    useUIStore.setState({ visualizerStyle: 'bars' });
  },
};

export default meta;

type Story = StoryObj<typeof VisualizerStep>;

/** Bars selected — the style grid renders with the active tile pressed. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Give the sound a shape.' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('Choose a visualizer')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Bars', pressed: true })).toBeInTheDocument();
  },
};

/** Picking a different tile writes the style through the UI store. */
export const SelectsStyle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Waveform' }));

    await waitFor(() => expect(useUIStore.getState().visualizerStyle).toBe('waveform'));
    await expect(
      canvas.getByRole('button', { name: 'Waveform', pressed: true })
    ).toBeInTheDocument();
  },
};
