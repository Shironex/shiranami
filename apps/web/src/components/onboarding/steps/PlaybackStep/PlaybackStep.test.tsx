import type { ReactElement, ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
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

beforeEach(() => {
  usePlaybackStore.setState({ crossfadeEnabled: false, crossfadeDuration: 5 });
});

afterEach(() => {
  usePlaybackStore.setState({ crossfadeEnabled: false, crossfadeDuration: 5 });
});

describe('PlaybackStep', () => {
  it('renders the eyebrow and the core playback toggles', () => {
    renderStep();

    expect(screen.getByText('04 · How it plays')).toBeInTheDocument();
    expect(screen.getByText('Resume where I left off')).toBeInTheDocument();
    expect(screen.getByText('Crossfade tracks')).toBeInTheDocument();
  });

  it('hides the crossfade duration slider until crossfade is enabled', () => {
    renderStep();

    expect(screen.queryByRole('slider', { name: 'Crossfade length' })).not.toBeInTheDocument();
  });

  it('shows a labelled duration slider when crossfade is pre-enabled', () => {
    usePlaybackStore.setState({ crossfadeEnabled: true, crossfadeDuration: 8 });
    renderStep();

    expect(screen.getByRole('slider', { name: 'Crossfade length' })).toBeInTheDocument();
  });

  it('flips the crossfade flag in the playback store when toggled on', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('switch', { name: 'Crossfade tracks' }));

    await waitFor(() => expect(usePlaybackStore.getState().crossfadeEnabled).toBe(true));
  });
});
