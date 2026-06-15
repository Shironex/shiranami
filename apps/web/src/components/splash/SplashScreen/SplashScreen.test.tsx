import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import SplashScreen from './SplashScreen';

function renderSplash(ui: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('SplashScreen', () => {
  it('mounts the brand block and night scene while loading', () => {
    renderSplash(<SplashScreen isLoading isError={false} />);

    // The brand wordmark renders the kanji subtitle once mounted.
    expect(screen.getByText('Shira')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('surfaces the error message and retry affordance in the error variant', () => {
    renderSplash(
      <SplashScreen isLoading={false} isError error="Could not read your music library." />
    );

    expect(screen.getByText('Could not read your music library.')).toBeInTheDocument();
    // The status block starts aria-hidden (the 600ms fade-in is timer-gated), so
    // query the retry control by its text rather than its a11y role.
    const retry = screen.getByText('Try again');
    expect(retry.closest('button')).not.toBeNull();
  });
});
