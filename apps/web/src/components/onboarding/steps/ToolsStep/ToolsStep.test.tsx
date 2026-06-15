import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { OnboardingStepContext } from '../../stepContext';

import ToolsStep from './ToolsStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'tools',
        kanji: '取',
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
        <ToolsStep />
      </StepHost>
    </QueryClientProvider>
  );
  render(ui);
}

describe('ToolsStep', () => {
  it('renders the eyebrow and the download-helpers title', () => {
    renderStep();

    expect(screen.getByText('02 · Bring the tools')).toBeInTheDocument();
    expect(screen.getByText('Download helpers')).toBeInTheDocument();
  });

  it('shows the optional skip hint on desktop', () => {
    renderStep();

    expect(
      screen.getByText('Optional. Only needed for downloading and importing.')
    ).toBeInTheDocument();
  });

  it('holds a polite checking status region while tool status resolves', () => {
    // The test electronAPI mock returns no cached/fresh tool status, so the step
    // stays in its checking state and surfaces a live region for screen readers.
    renderStep();

    expect(screen.getByRole('status')).toHaveTextContent('Checking for helpers…');
  });
});
