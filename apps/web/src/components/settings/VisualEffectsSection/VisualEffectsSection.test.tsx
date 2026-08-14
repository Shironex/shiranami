import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';

import VisualEffectsSection from './VisualEffectsSection';

let nextId = 0;
function makeTrack(overrides: Partial<Track> = {}): Track {
  nextId += 1;
  return {
    id: `t${nextId}`,
    title: `Track ${nextId}`,
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: `/music/${nextId}.mp3`,
    isFavorite: false,
    bpm: null,
    musicalKey: null,
    ...overrides,
  };
}

function reset(): void {
  useUIStore.setState({
    nowPlayingViewEnabled: true,
    libraryHeroCardEnabled: true,
    lowPerformanceMode: false,
    noiseOverlayEnabled: false,
    tempoBreathingEnabled: true,
    artworkBloomEnabled: true,
    coverCrossfadeEnabled: true,
    vinylDisplayEnabled: false,
    vinylLabelSource: 'artwork',
    vinylRingStyle: 'glow',
    roomLightEnabled: true,
  });
  useLibraryStore.setState({ library: [], libraryLoaded: true });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('VisualEffectsSection', () => {
  it('renders the effect toggle rows', () => {
    render(<VisualEffectsSection />);

    expect(screen.getByText('Now Playing view')).toBeInTheDocument();
    expect(screen.getByText('Vinyl record display')).toBeInTheDocument();
    expect(screen.getByText('Low performance mode')).toBeInTheDocument();
    expect(screen.getByText('Noise texture')).toBeInTheDocument();
    expect(screen.getByText('Artwork bloom')).toBeInTheDocument();
    expect(screen.getByText('Cover crossfade')).toBeInTheDocument();
    expect(screen.getByText('Room light')).toBeInTheDocument();
    expect(screen.getByText('Tempo breathing')).toBeInTheDocument();
  });

  it('toggles the vinyl display through the store setter', async () => {
    const user = userEvent.setup();
    const setVinylDisplayEnabled = vi.fn();
    useUIStore.setState({ setVinylDisplayEnabled });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Vinyl record display' }));

    expect(setVinylDisplayEnabled).toHaveBeenCalledWith(true);
  });

  it('shows the label and ring pickers only while the vinyl display is on', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<VisualEffectsSection />);

    expect(screen.queryByText('Record label')).not.toBeInTheDocument();

    useUIStore.setState({ vinylDisplayEnabled: true });
    rerender(<VisualEffectsSection />);

    expect(screen.getByText('Record label')).toBeInTheDocument();
    expect(screen.getByText('Reactive ring')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Spectrum' }));
    expect(useUIStore.getState().vinylRingStyle).toBe('spectrum');

    await user.click(screen.getByRole('button', { name: 'Brand mark' }));
    expect(useUIStore.getState().vinylLabelSource).toBe('logo');
  });

  it('toggles the artwork bloom through the store setter', async () => {
    const user = userEvent.setup();
    const setArtworkBloomEnabled = vi.fn();
    useUIStore.setState({ setArtworkBloomEnabled });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Artwork bloom' }));

    expect(setArtworkBloomEnabled).toHaveBeenCalledWith(false);
  });

  it('toggles the cover crossfade through the store setter', async () => {
    const user = userEvent.setup();
    const setCoverCrossfadeEnabled = vi.fn();
    useUIStore.setState({ setCoverCrossfadeEnabled });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Cover crossfade' }));

    expect(setCoverCrossfadeEnabled).toHaveBeenCalledWith(false);
  });

  it('toggles the room light through the store setter', async () => {
    const user = userEvent.setup();
    const setRoomLightEnabled = vi.fn();
    useUIStore.setState({ setRoomLightEnabled });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Room light' }));

    expect(setRoomLightEnabled).toHaveBeenCalledWith(false);
  });

  it('toggles tempo breathing through the store setter', async () => {
    const user = userEvent.setup();
    const setTempoBreathingEnabled = vi.fn();
    useUIStore.setState({ setTempoBreathingEnabled });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Tempo breathing' }));

    expect(setTempoBreathingEnabled).toHaveBeenCalledWith(false);
  });

  it('hints at the analysis card when tempo coverage is low', () => {
    useLibraryStore.setState({ library: [makeTrack(), makeTrack()] });

    render(<VisualEffectsSection />);

    expect(screen.getByText(/Run the analysis once/)).toBeInTheDocument();
  });

  it('drops the hint when coverage is healthy or breathing is off', () => {
    useLibraryStore.setState({
      library: [makeTrack({ bpm: 80, musicalKey: 'C major' })],
    });

    const { rerender } = render(<VisualEffectsSection />);
    expect(screen.queryByText(/Run the analysis once/)).not.toBeInTheDocument();

    useLibraryStore.setState({ library: [makeTrack()] });
    useUIStore.setState({ tempoBreathingEnabled: false });
    rerender(<VisualEffectsSection />);
    expect(screen.queryByText(/Run the analysis once/)).not.toBeInTheDocument();
  });

  it('toggles low performance mode through the store setter', async () => {
    const user = userEvent.setup();
    const setLowPerformanceMode = vi.fn();
    useUIStore.setState({ setLowPerformanceMode });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Low performance mode' }));

    expect(setLowPerformanceMode).toHaveBeenCalledWith(true);
  });
});
