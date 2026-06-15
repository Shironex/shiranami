import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { OnboardingStepContext } from '../../stepContext';

import PlaybackStep from './PlaybackStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'playback',
        kanji: '音',
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
        <PlaybackStep />
      </StepHost>
    </QueryClientProvider>
  );
  render(ui);
}

describe('PlaybackStep', () => {
  it('renders the eyebrow and the core playback toggles', () => {
    renderStep();

    expect(screen.getByText('04 · How it plays')).toBeInTheDocument();
    expect(screen.getByText('Resume where I left off')).toBeInTheDocument();
    expect(screen.getByText('Crossfade tracks')).toBeInTheDocument();
  });
});
