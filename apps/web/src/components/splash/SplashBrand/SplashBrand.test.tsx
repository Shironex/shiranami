import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SplashBrand from './SplashBrand';
import type { ISplashBrandProps } from './SplashBrand.types';

function renderBrand(overrides: Partial<ISplashBrandProps> = {}): HTMLElement {
  render(
    <SplashBrand
      showStatus={overrides.showStatus ?? true}
      variant={overrides.variant ?? 'loading'}
      messageKey={overrides.messageKey ?? 'loading1'}
      error={overrides.error}
      reducedMotion={overrides.reducedMotion ?? false}
    />
  );
  return screen.getByRole('status');
}

function sweepBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.splash-sweep');
}

describe('SplashBrand', () => {
  it('announces boot progress from a polite live region', () => {
    const block = renderBrand();

    expect(block).toHaveAttribute('aria-live', 'polite');
    // The rotating message is the payload the live region exists to announce.
    expect(block).toHaveTextContent('Tuning the instruments...');
  });

  it('renders the badge, the two-tone wordmark, and the kanji subtitle', () => {
    renderBrand();

    expect(screen.getByText('Starting up')).toBeInTheDocument();
    // "Shira" + an <em>nami</em> tinted with --primary, inside the h1.
    const wordmark = screen.getByRole('heading', { level: 1 });
    expect(wordmark).toHaveTextContent('Shiranami');
    expect(wordmark.querySelector('em')).toHaveTextContent('nami');
    expect(screen.getByText('白波 · the white waves')).toBeInTheDocument();
  });

  it('swaps the rotating message when the message key changes', () => {
    renderBrand({ messageKey: 'loading4' });

    expect(screen.getByText('Warming up the speakers...')).toBeInTheDocument();
    expect(screen.queryByText('Tuning the instruments...')).not.toBeInTheDocument();
  });

  it('shows the sweep loader while loading and hides it in the error variant', () => {
    const { unmount } = render(
      <SplashBrand
        showStatus
        variant="loading"
        messageKey="loading1"
        error={null}
        reducedMotion={false}
      />
    );
    expect(sweepBar()).not.toBeNull();
    unmount();

    renderBrand({ variant: 'error', error: 'Could not read your music library.' });
    expect(sweepBar()).toBeNull();
  });

  it('replaces the loader with the failure message and a retry control on error', () => {
    renderBrand({ variant: 'error', error: 'Could not read your music library.' });

    expect(screen.getByText('Could not read your music library.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Tuning the instruments...')).not.toBeInTheDocument();
  });

  it('falls back to the retry copy when the error variant carries no message', () => {
    renderBrand({ variant: 'error', error: null });

    // Message line + button label both read "Try again" rather than a blank row.
    expect(screen.getAllByText('Try again')).toHaveLength(2);
  });

  it('reloads the window when retry is pressed', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });

    try {
      renderBrand({ variant: 'error', error: 'Boom.' });
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('fades the status block out and hides it from assistive tech before it lands', () => {
    const block = renderBrand({ showStatus: false });

    const status = block.querySelector('[aria-hidden="true"].transition-opacity');
    expect(status).not.toBeNull();
    expect(status).toHaveClass('opacity-0', 'pointer-events-none');
  });

  it('runs the LED, sweep, and message loops by default', () => {
    const block = renderBrand();

    const led = block.querySelector<HTMLElement>('.splash-led');
    expect(led?.style.animation).toBe('splash-led-pulse 1.6s ease-in-out infinite');
    expect(sweepBar()?.style.animation).toBe('splash-sweep 1.8s ease-in-out infinite');
    expect(screen.getByText('Tuning the instruments...').style.animation).toBe(
      'shiranami-msg-fade 320ms ease-out both'
    );
  });

  it('drops every inline loop under reduced motion but keeps the loader track', () => {
    const block = renderBrand({ reducedMotion: true });

    const led = block.querySelector<HTMLElement>('.splash-led');
    expect(led?.style.animation).toBe('');
    // The track stays so the block still reads as "loading", only the sweep stops.
    expect(sweepBar()).not.toBeNull();
    expect(sweepBar()?.style.animation).toBe('');
    expect(screen.getByText('Tuning the instruments...').style.animation).toBe('');
  });
});
