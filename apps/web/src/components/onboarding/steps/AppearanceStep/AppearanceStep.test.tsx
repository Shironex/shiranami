import type { ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingStepContext } from '../../stepContext';

import AppearanceStep from './AppearanceStep';

function renderStep(): void {
  const host = (children: ReactNode) => (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'appearance',
        kanji: '夜',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
  render(host(<AppearanceStep />));
}

describe('AppearanceStep', () => {
  it('renders the eyebrow and the theme + comfort sections', () => {
    renderStep();

    expect(screen.getByText('03 · Make it yours')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Comfort')).toBeInTheDocument();
    expect(screen.getByText('Interface size')).toBeInTheDocument();
  });

  it('exposes the reduce-effects toggle', () => {
    renderStep();

    expect(screen.getByText('Reduce effects')).toBeInTheDocument();
  });
});
