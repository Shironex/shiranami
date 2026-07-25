import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { OnboardingStepContext } from '../../stepContext';

import WelcomeStep from './WelcomeStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'welcome',
        kanji: '白波',
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
        <WelcomeStep />
      </StepHost>
    </QueryClientProvider>
  );
  render(ui);
}

afterEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage('en');
});

describe('WelcomeStep', () => {
  it('renders the eyebrow with the running version interpolated', () => {
    renderStep();

    // The version comes from the app-version query, so match its shape rather
    // than the shipped number.
    expect(screen.getByText(/^Vol · NS · .+ · late night build$/)).toBeInTheDocument();
  });

  it('renders the headline as a single accessible name despite the accent', () => {
    renderStep();

    // The <1> slot renders an <em> inside the heading; it must not split the name.
    expect(
      screen.getByRole('heading', { name: 'A softer place for your music library.' })
    ).toBeInTheDocument();
  });

  it('renders the mascot portrait with its shared alt text', () => {
    renderStep();

    expect(screen.getByRole('img', { name: 'Shiranami mascot' })).toBeInTheDocument();
  });

  it('marks only the active language pill as pressed', () => {
    renderStep();

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Polski' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the step copy to the picked language and moves the pressed state', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('button', { name: 'Polski' }));

    await waitFor(() =>
      expect(
        screen.getByText('Możesz to zmienić w każdej chwili w Ustawienia · Wygląd.')
      ).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Polski' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // The mascot alt comes from the settings namespace, which follows too.
    expect(screen.getByRole('img', { name: 'Maskotka Shiranami' })).toBeInTheDocument();
  });

  it('persists the picked language so the next launch starts in it', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('button', { name: 'Polski' }));

    await waitFor(() => expect(window.localStorage.getItem('shiranami.language')).toBe('pl'));
  });
});
