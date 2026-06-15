import type { ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';
import { OnboardingStepContext } from '../../stepContext';

import VisualizerStep from './VisualizerStep';

function renderStep(): void {
  const host = (children: ReactNode) => (
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
  render(host(<VisualizerStep />));
}

beforeEach(() => {
  useUIStore.setState({ visualizerStyle: 'bars' });
});

afterEach(() => {
  useUIStore.setState({ visualizerStyle: 'bars' });
});

describe('VisualizerStep', () => {
  it('renders the eyebrow and the visualizer chooser title', () => {
    renderStep();

    expect(screen.getByText('05 · The rhythm')).toBeInTheDocument();
    expect(screen.getByText('Choose a visualizer')).toBeInTheDocument();
  });

  it('marks the seeded style as the pressed tile', () => {
    renderStep();

    expect(screen.getByRole('button', { name: 'Bars', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waveform', pressed: false })).toBeInTheDocument();
  });

  it('writes the chosen visualizer style back through the UI store', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('button', { name: 'Waveform' }));

    await waitFor(() => expect(useUIStore.getState().visualizerStyle).toBe('waveform'));
  });
});
