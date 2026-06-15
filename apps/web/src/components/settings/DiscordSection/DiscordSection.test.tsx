import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';

import DiscordSection from './DiscordSection';

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscordSection />
    </QueryClientProvider>
  );
}

function reset(): void {
  vi.mocked(window.electronAPI.discord.getSettings).mockResolvedValue({
    enabled: false,
    showTrackDetails: true,
    showElapsedTime: true,
    useCustomTemplates: false,
    templates: DEFAULT_DISCORD_TEMPLATES,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(() => vi.clearAllMocks());

describe('DiscordSection', () => {
  it('renders the rich presence card once settings load', async () => {
    renderSection();

    expect(await screen.findByText('Discord Rich Presence')).toBeInTheDocument();
  });

  it('hides the preview card while presence is disabled', async () => {
    renderSection();
    await screen.findByText('Discord Rich Presence');

    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });
});
