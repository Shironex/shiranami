import type { ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

describe('VisualizerStep', () => {
  it('renders the eyebrow and the visualizer chooser title', () => {
    renderStep();

    expect(screen.getByText('05 · The rhythm')).toBeInTheDocument();
    expect(screen.getByText('Choose a visualizer')).toBeInTheDocument();
  });
});
