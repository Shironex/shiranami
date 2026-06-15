import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import { useUIStore } from '@/stores/useUIStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
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

beforeEach(() => {
  useThemeStore.setState({ theme: 'none' });
  useUIStore.setState({ visualizerStyle: 'bars' });
  usePlaybackStore.setState({ crossfadeEnabled: false });
  useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
});

afterEach(() => {
  useThemeStore.setState({ theme: 'none' });
  usePlaybackStore.setState({ crossfadeEnabled: false });
  useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
});

describe('SummaryStep', () => {
  it('renders the eyebrow and a recap row per choice', () => {
    renderStep();

    expect(screen.getByText('07 · All set')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Music folders')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Crash reports')).toBeInTheDocument();
  });

  it('groups the recap rows in a labelled list', () => {
    renderStep();

    const list = screen.getByRole('list', { name: 'Your setup choices' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(6);
  });

  it('reflects the seeded theme and crash-report choices in the recap values', () => {
    useThemeStore.setState({ theme: 'snow' });
    useTelemetryStore.setState({ enabled: true, performanceEnabled: true });
    renderStep();

    expect(screen.getByText('Snow')).toBeInTheDocument();
    expect(screen.getByText('On · performance')).toBeInTheDocument();
  });
});
