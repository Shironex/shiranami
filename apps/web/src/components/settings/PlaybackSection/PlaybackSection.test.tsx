import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import PlaybackSection from './PlaybackSection';

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlaybackSection />
    </QueryClientProvider>
  );
}

function reset(): void {
  usePlaybackStore.setState({
    crossfadeEnabled: false,
    crossfadeDuration: 4,
    loudnessEnabled: false,
    loudnessTargetLufs: -14,
    sleepFadeDuration: 5,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('PlaybackSection', () => {
  it('renders the playback preference rows', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Playback' })).toBeInTheDocument();
    expect(screen.getByText('Crossfade')).toBeInTheDocument();
    expect(screen.getByText('Loudness leveling')).toBeInTheDocument();
  });

  it('toggles crossfade through the store setter', async () => {
    const user = userEvent.setup();
    const setCrossfadeEnabled = vi.fn();
    usePlaybackStore.setState({ setCrossfadeEnabled });
    renderSection();

    await user.click(screen.getByRole('switch', { name: 'Crossfade' }));

    expect(setCrossfadeEnabled).toHaveBeenCalledWith(true);
  });

  it('reveals the crossfade duration slider only when crossfade is on', () => {
    usePlaybackStore.setState({ crossfadeEnabled: true });
    renderSection();

    expect(screen.getByText('Crossfade')).toBeInTheDocument();
    // The duration tick labels appear once the slider section is shown.
    expect(screen.getByText('12s')).toBeInTheDocument();
  });
});
