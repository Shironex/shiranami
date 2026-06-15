import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';

import LyricsSection from './LyricsSection';

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
    render(<LyricsSection />);

    expect(screen.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();
  });

  it('sets the plain-lyrics font size when a size chip is clicked', async () => {
    const user = userEvent.setup();
    const setLyricsPlainFontSize = vi.fn();
    useLyricsAppearanceStore.setState({ setLyricsPlainFontSize });
    render(<LyricsSection />);

    const radiogroups = screen.getAllByRole('radiogroup');
    const plainSizeButtons = within(radiogroups[0]).getAllByRole('radio');
    await user.click(plainSizeButtons[2]);

    expect(setLyricsPlainFontSize).toHaveBeenCalledWith('lg');
  });
});
