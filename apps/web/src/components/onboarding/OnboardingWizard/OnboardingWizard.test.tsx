import type { ReactElement, ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

import OnboardingWizard from './OnboardingWizard';
import { useOnboardingWizard } from './OnboardingWizard.hooks';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const matchMedia = window.matchMedia as unknown as ReturnType<typeof vi.fn>;

/**
 * Force `prefers-reduced-motion` for the rest of the test. `useReducedMotion`
 * reads `matchMedia` twice — once for its initial state and again inside an
 * effect that also attaches a `change` listener — so a one-shot mock is not
 * enough: the implementation has to answer every call. Reset in `afterEach`.
 */
function setPrefersReducedMotion(reduced: boolean): void {
  matchMedia.mockImplementation((query: string) => ({
    matches: reduced && query === REDUCED_MOTION_QUERY,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderWizard(onComplete: () => void = () => {}): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <OnboardingWizard onComplete={onComplete} />
    </QueryClientProvider>
  );
  render(ui);
}

function renderWizardHook(onComplete: () => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useOnboardingWizard({ onComplete }), { wrapper });
}

/** Jump the wizard hook to its final (summary) step, where the CTA finishes. */
function selectFinalStep(result: { current: ReturnType<typeof useOnboardingWizard> }): void {
  act(() => result.current.steps[result.current.steps.length - 1].onSelect());
  expect(result.current.isLast).toBe(true);
}

afterEach(() => {
  useOnboardingStore.setState({ hasCompletedOnboarding: false });
  useUIStore.setState({ lowPerformanceMode: false });
  setPrefersReducedMotion(false);
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
    setPrefersReducedMotion(true);
    const onComplete = vi.fn();
    renderWizard(onComplete);

    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });
});

describe('OnboardingWizard completion flourish', () => {
  it('celebrates on the final-step CTA when motion is enabled and defers finish', async () => {
    // Motion enabled: reduced-motion mock stays false (default) and low-perf off.
    const onComplete = vi.fn();
    const { result } = renderWizardHook(onComplete);
    selectFinalStep(result);

    act(() => result.current.onPrimary());

    // The flourish plays and finish is held behind the exit fog-out — the
    // CompletionFlourish path is taken and completion is NOT synchronous.
    expect(result.current.isCelebrating).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();

    // finish resolves once the exit-animation window elapses.
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });

  it('does not celebrate on the final-step CTA under low-performance mode', async () => {
    useUIStore.setState({ lowPerformanceMode: true });
    const onComplete = vi.fn();
    const { result } = renderWizardHook(onComplete);
    selectFinalStep(result);

    act(() => result.current.onPrimary());

    // disableMotion → no flourish and finish runs synchronously.
    expect(result.current.isCelebrating).toBe(false);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });

  it('does not celebrate on the final-step CTA under reduced motion', async () => {
    setPrefersReducedMotion(true);
    const onComplete = vi.fn();
    const { result } = renderWizardHook(onComplete);
    selectFinalStep(result);

    act(() => result.current.onPrimary());

    expect(result.current.isCelebrating).toBe(false);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
  });

  it('never celebrates when dismissed via the Skip control, even with motion enabled', async () => {
    const onComplete = vi.fn();
    const { result } = renderWizardHook(onComplete);
    selectFinalStep(result);

    act(() => result.current.onSkip());

    // Skip is the completion path too, but it must never light the flourish.
    expect(result.current.isCelebrating).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('never celebrates when dismissed via Esc, even with motion enabled', async () => {
    const onComplete = vi.fn();
    const { result } = renderWizardHook(onComplete);
    selectFinalStep(result);

    // Bubbles up to the window keydown listener the hook installs.
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(result.current.isCelebrating).toBe(false);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
