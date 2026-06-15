import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

import AboutSection from './AboutSection';

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AboutSection />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AboutSection', () => {
  it('renders the hero, story, logs, and replay cards', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Shiranami' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Application logs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Replay onboarding' })).toBeInTheDocument();
  });

  it('resets onboarding when the replay button is clicked', async () => {
    const user = userEvent.setup();
    const resetOnboarding = vi.fn();
    useOnboardingStore.setState({ resetOnboarding });
    renderSection();

    await user.click(screen.getByRole('button', { name: /Replay setup/ }));

    expect(resetOnboarding).toHaveBeenCalled();
  });
});
