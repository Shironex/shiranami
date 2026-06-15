import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
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

function renderStep(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <StepHost>
        <SummaryStep />
      </StepHost>
    </QueryClientProvider>
  );
  render(ui);
}

describe('SummaryStep', () => {
  it('renders the eyebrow and a recap row per choice', () => {
    renderStep();

    expect(screen.getByText('07 · All set')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Music folders')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Crash reports')).toBeInTheDocument();
  });
});
