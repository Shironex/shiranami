import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { OnboardingStepContext } from '../../stepContext';

import FoldersStep from './FoldersStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'folders',
        kanji: '蔵',
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
        <FoldersStep />
      </StepHost>
    </QueryClientProvider>
  );
  render(ui);
}

describe('FoldersStep', () => {
  it('renders the eyebrow, title, and the empty state with no folders', () => {
    renderStep();

    expect(screen.getByText('01 · Point it at your files')).toBeInTheDocument();
    expect(screen.getByText('Music folders')).toBeInTheDocument();
    expect(
      screen.getByText('No folders yet. Add one to start building your library.')
    ).toBeInTheDocument();
  });

  it('exposes an enabled add-folder control under the Electron test mock', () => {
    renderStep();

    // The test setup mocks window.electronAPI, so IS_ELECTRON is true and the
    // OS folder picker is live (not the disabled desktop-only fallback).
    const addButton = screen.getByRole('button', { name: 'Add folder' });
    expect(addButton).toBeInTheDocument();
    expect(addButton).toBeEnabled();
  });

  it('shows no folder rows for an empty library', () => {
    renderStep();

    expect(screen.queryByRole('button', { name: 'Remove folder' })).not.toBeInTheDocument();
  });
});
