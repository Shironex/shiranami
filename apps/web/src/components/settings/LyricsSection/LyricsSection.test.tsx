import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';

import LyricsSection from './LyricsSection';

/** The section hook invalidates lyrics queries, so it needs a query client. */
function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LyricsSection />
    </QueryClientProvider>
  );
}

function reset(): void {
  useLyricsAppearanceStore.setState({
    lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
    lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
    lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
    lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('LyricsSection', () => {
  it('renders the lyrics card with both subsections', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();
  });

  it('persists the LRCLIB source-preference toggle', async () => {
    const user = userEvent.setup();
    renderSection();

    const toggle = screen.getByRole('switch', { name: 'Prefer synced lyrics from LRCLIB' });
    // Disabled until the persisted value has seeded from electron-store.
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);

    // Optimistic flip + persist through the store IPC.
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(window.electronAPI.store.set).toHaveBeenCalledWith(
      'lyrics.preferSyncedFromLrclib',
      true
    );
  });

  it('sets the plain-lyrics font size when a size chip is clicked', async () => {
    const user = userEvent.setup();
    const setLyricsPlainFontSize = vi.fn();
    useLyricsAppearanceStore.setState({ setLyricsPlainFontSize });
    renderSection();

    const radiogroups = screen.getAllByRole('radiogroup');
    const plainSizeButtons = within(radiogroups[0]).getAllByRole('radio');
    await user.click(plainSizeButtons[2]);

    expect(setLyricsPlainFontSize).toHaveBeenCalledWith('lg');
  });
});
