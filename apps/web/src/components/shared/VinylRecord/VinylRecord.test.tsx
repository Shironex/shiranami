import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';

import VinylRecord from './VinylRecord';

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  useUIStore.setState({
    vinylLabelSource: 'artwork',
    vinylRingStyle: 'glow',
    lowPerformanceMode: false,
  });
}

beforeEach(reset);
afterEach(reset);

describe('VinylRecord', () => {
  it('renders the disc with the artwork label when art is available', () => {
    render(<VinylRecord albumArt="art://cover.jpg" albumAlt="Late Nights" />);

    expect(document.querySelector('[data-slot="vinyl-record"]')).toBeInTheDocument();
    expect(screen.getByAltText('Late Nights')).toHaveAttribute('src', 'art://cover.jpg');
  });

  it('falls back to the brand mark when the track has no artwork', () => {
    render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(screen.queryByAltText('Late Nights')).not.toBeInTheDocument();
    expect(document.querySelector('.vinyl-label')).toHaveTextContent('白波');
  });

  it('shows the brand mark instead of artwork under the logo label source', () => {
    useUIStore.setState({ vinylLabelSource: 'logo' });

    render(<VinylRecord albumArt="art://cover.jpg" albumAlt="Late Nights" />);

    expect(screen.queryByAltText('Late Nights')).not.toBeInTheDocument();
    expect(document.querySelector('.vinyl-label')).toHaveTextContent('白波');
  });

  it('mounts the reactive ring canvas while a ring style is on', () => {
    const { container } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
    expect(container.querySelector('.vinyl-static-ring')).not.toBeInTheDocument();
  });

  it('omits the ring entirely when the style is off', () => {
    useUIStore.setState({ vinylRingStyle: 'off' });

    const { container } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
    expect(container.querySelector('.vinyl-static-ring')).not.toBeInTheDocument();
  });

  it('swaps the canvas for the static halo when decorative motion is suppressed', () => {
    useUIStore.setState({ lowPerformanceMode: true });

    const { container } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
    expect(container.querySelector('.vinyl-static-ring')).toBeInTheDocument();
  });
});
