import type { ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingStepContext } from '../../stepContext';

import PrivacyStep from './PrivacyStep';

function renderStep(): void {
  const host = (children: ReactNode) => (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'privacy',
        kanji: '守',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
  render(host(<PrivacyStep />));
}

describe('PrivacyStep', () => {
  it('renders the eyebrow and the sent/not-sent disclosure columns', () => {
    renderStep();

    expect(screen.getByText('06 · Crash reports')).toBeInTheDocument();
    expect(screen.getByText("What's sent")).toBeInTheDocument();
    expect(screen.getByText("What's never sent")).toBeInTheDocument();
    expect(screen.getByText('Send crash reports')).toBeInTheDocument();
  });
});
