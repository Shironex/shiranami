import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

import OnboardingWizard from './OnboardingWizard';

function renderWizard(onComplete: () => void = () => {}): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <OnboardingWizard onComplete={onComplete} />
    </QueryClientProvider>
  );
  render(ui);
}

afterEach(() => {
  useOnboardingStore.setState({ hasCompletedOnboarding: false });
  useUIStore.setState({ lowPerformanceMode: false });
});

describe('OnboardingWizard', () => {
  it('renders the dialog with the first (welcome) step', () => {
    renderWizard();

    expect(screen.getByRole('dialog', { name: 'First-run setup' })).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    // The Back control is hidden on the first step.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('renders one progress dot per step', () => {
    renderWizard();

    const dots = screen.getAllByRole('button', { name: /Go to step/ });
    expect(dots).toHaveLength(8);
  });

  it('advances to the next step when the primary button is pressed', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    // The folders step (step 2) exposes a Back control.
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('marks the active step dot with aria-current', () => {
    renderWizard();

    const activeDot = screen.getByRole('button', { name: 'Go to step 1: welcome' });
    expect(activeDot).toHaveAttribute('aria-current', 'step');
    // Non-active dots carry no aria-current.
    expect(screen.getByRole('button', { name: 'Go to step 2: folders' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('jumps directly to a step via its progress dot', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Go to step 8: summary' }));

    expect(screen.getByRole('heading', { name: 'Your room is ready.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open library' })).toBeInTheDocument();
  });

  it('completes onboarding from the summary step (low-perf finishes synchronously)', async () => {
    const user = userEvent.setup();
    // Disabling motion makes finish() complete without the exit-animation timer.
    useUIStore.setState({ lowPerformanceMode: true });
    const onComplete = vi.fn();
    renderWizard(onComplete);

    await user.click(screen.getByRole('button', { name: 'Go to step 8: summary' }));
    await user.click(screen.getByRole('button', { name: 'Open library' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });

  it('completes onboarding when skipped (reduced motion finishes synchronously)', async () => {
    const user = userEvent.setup();
    const matchMedia = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
    matchMedia.mockImplementationOnce((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const onComplete = vi.fn();
    renderWizard(onComplete);

    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });
});
