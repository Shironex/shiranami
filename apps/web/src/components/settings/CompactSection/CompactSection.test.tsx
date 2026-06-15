import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompactStore } from '@/stores/useCompactStore';

import CompactSection from './CompactSection';

function reset(): void {
  useCompactStore.setState({
    compactSize: 'md',
    compactFontSize: 'md',
    compactShowAlbumArt: true,
    compactShowAlbum: true,
    compactShowSeek: true,
    compactShowVolume: true,
    compactShowFavorite: false,
    compactShowLyrics: false,
    compactDefaultAlwaysOnTop: false,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('CompactSection', () => {
  it('renders the compact mode card', () => {
    render(<CompactSection />);

    expect(screen.getByRole('heading', { name: 'Compact mode' })).toBeInTheDocument();
  });

  it('sets the window size when a preset chip is clicked', async () => {
    const user = userEvent.setup();
    const setCompactSize = vi.fn();
    useCompactStore.setState({ setCompactSize });
    render(<CompactSection />);

    await user.click(screen.getByRole('button', { name: 'Medium' }));

    expect(setCompactSize).toHaveBeenCalledWith('md');
  });
});
