import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import UpdatesSection from './UpdatesSection';

// The platform the test pretends to run on. Both the `@/lib/platform` constants
// and `window.electronAPI.platform` follow it, so a platform branch keyed off
// either source would be exercised.
const platformState = vi.hoisted(() => ({ current: 'win32' as NodeJS.Platform }));

vi.mock('@/lib/platform', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/platform')>();
  return {
    ...actual,
    IS_ELECTRON: true,
    get IS_MAC() {
      return platformState.current === 'darwin';
    },
    get IS_WINDOWS() {
      return platformState.current === 'win32';
    },
  };
});

const originalPlatform = window.electronAPI.platform;

function mockPlatform(platform: NodeJS.Platform): void {
  platformState.current = platform;
  window.electronAPI.platform = platform;
}

afterEach(() => {
  platformState.current = 'win32';
  window.electronAPI.platform = originalPlatform;
});

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UpdatesSection />
    </QueryClientProvider>
  );
}

describe('UpdatesSection', () => {
  it('shows the idle status message by default', () => {
    renderSection();

    expect(screen.getByText('No updates available')).toBeInTheDocument();
  });

  it('announces the status message as a live region', () => {
    renderSection();

    expect(screen.getByRole('status')).toHaveTextContent('No updates available');
  });

  describe.each(['win32', 'darwin'] as const)('on %s', platform => {
    it('renders the check for updates flow', () => {
      mockPlatform(platform);
      renderSection();

      expect(screen.getByRole('heading', { name: 'Updates' })).toBeInTheDocument();
      expect(screen.getByText('Check for new versions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
      expect(screen.getByText('No updates available')).toBeInTheDocument();
    });

    it('does not fall back to the manual GitHub download notice', () => {
      mockPlatform(platform);
      renderSection();

      expect(screen.queryByText(/Auto-updates are not available/)).not.toBeInTheDocument();
      expect(screen.queryByText('Download updates from GitHub')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Open GitHub Releases' })).not.toBeInTheDocument();
    });
  });
});
