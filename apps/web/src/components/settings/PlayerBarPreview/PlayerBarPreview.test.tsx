import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useInterfaceStore, INTERFACE_DEFAULTS } from '@/stores/useInterfaceStore';

import PlayerBarPreview from './PlayerBarPreview';

/** Every collapsible mock element shares this frame. */
const ELEMENT = '.overflow-hidden.rounded-md';
/** The waveform seek strip is the only `gap-px` row. */
const WAVE_STRIP = '.gap-px';
/** The plain seek bar's filled head. */
const PLAIN_SEEK_FILL = '.bg-primary\\/55';

function resetInterface(): void {
  useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
}

beforeEach(resetInterface);
afterEach(resetInterface);

describe('PlayerBarPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<PlayerBarPreview />);

    expect(screen.getByRole('img', { name: 'Player bar preview' })).toBeInTheDocument();
  });

  it('renders every optional element expanded with the shipping defaults', () => {
    const { container } = render(<PlayerBarPreview />);

    // Album art, favorite, two time labels, six utility buttons, volume.
    const elements = container.querySelectorAll(ELEMENT);
    expect(elements).toHaveLength(11);
    for (const element of elements) {
      expect(element).toHaveClass('opacity-100');
    }
  });

  it('collapses only the element whose toggle is off', () => {
    useInterfaceStore.setState({ playerAlbumArt: false });
    const { container } = render(<PlayerBarPreview />);

    const elements = container.querySelectorAll(ELEMENT);
    expect(elements[0]).toHaveClass('max-w-0', 'opacity-0');
    expect(elements[1]).toHaveClass('opacity-100');
  });

  it('keeps the time labels mounted but folded when they are hidden', () => {
    useInterfaceStore.setState({ playerTimeLabels: false });
    render(<PlayerBarPreview />);

    // Both labels stay in the DOM so the collapse animates.
    expect(screen.getByText('1:24').parentElement).toHaveClass('max-w-0', 'opacity-0');
    expect(screen.getByText('3:45').parentElement).toHaveClass('max-w-0', 'opacity-0');
  });

  it('renders the full waveform strip as the seek surface by default', () => {
    const { container } = render(<PlayerBarPreview />);

    expect(container.querySelector(WAVE_STRIP)?.children).toHaveLength(24);
    expect(container.querySelector(PLAIN_SEEK_FILL)).toBeNull();
  });

  it('swaps the waveform for a plain progress bar when the seekbar is off', () => {
    useInterfaceStore.setState({ playerWaveformSeekbar: false });
    const { container } = render(<PlayerBarPreview />);

    expect(container.querySelector(WAVE_STRIP)).toBeNull();
    expect(container.querySelector(PLAIN_SEEK_FILL)).not.toBeNull();
  });

  it('spotlights only the element matching the hovered settings row', () => {
    const { container } = render(<PlayerBarPreview highlightedKey="playerVolume" />);

    expect(container.querySelectorAll('.ring-1')).toHaveLength(1);
    // Volume is the last collapsible element in the bar.
    const elements = container.querySelectorAll(ELEMENT);
    expect(elements[elements.length - 1]).toHaveClass('ring-1', 'ring-primary/40');
  });

  it('spotlights the seek surface itself, which is not a collapsible element', () => {
    const { container } = render(<PlayerBarPreview highlightedKey="playerWaveformSeekbar" />);

    expect(container.querySelector(WAVE_STRIP)).toHaveClass('ring-1', 'bg-primary/10');
  });

  it('does not spotlight a hidden element', () => {
    useInterfaceStore.setState({ playerVolume: false });
    const { container } = render(<PlayerBarPreview highlightedKey="playerVolume" />);

    expect(container.querySelectorAll('.ring-1')).toHaveLength(0);
  });

  it('keeps the core transport controls and seek row when every toggle is off', () => {
    useInterfaceStore.setState({
      playerAlbumArt: false,
      playerFavorite: false,
      playerTimeLabels: false,
      playerSleepTimer: false,
      playerEqualizer: false,
      playerCompactButton: false,
      playerVisualizerButton: false,
      playerLyricsButton: false,
      playerQueueButton: false,
      playerVolume: false,
    });
    const { container } = render(<PlayerBarPreview />);

    expect(container.querySelector(WAVE_STRIP)?.children).toHaveLength(24);
    expect(screen.getByRole('img', { name: 'Player bar preview' })).toBeInTheDocument();
  });
});
