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
    vinylSpeed: '33',
    vinylFinish: 'black',
    vinylTonearmEnabled: false,
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

  it('maps the RPM setting to a real revolution duration on the disc', () => {
    const { container, rerender } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    const disc = container.querySelector<HTMLElement>('.vinyl-disc');
    expect(disc!.style.getPropertyValue('--vinyl-rev')).toBe('1.8s');

    useUIStore.setState({ vinylSpeed: '45' });
    rerender(<VinylRecord albumArt={null} albumAlt="Late Nights" />);
    expect(disc!.style.getPropertyValue('--vinyl-rev')).toBe('1.333s');

    useUIStore.setState({ vinylSpeed: '78' });
    rerender(<VinylRecord albumArt={null} albumAlt="Late Nights" />);
    expect(disc!.style.getPropertyValue('--vinyl-rev')).toBe('0.769s');
  });

  it('stamps the chosen finish on the disc for the face styling', () => {
    useUIStore.setState({ vinylFinish: 'marble' });

    const { container } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('.vinyl-disc')).toHaveAttribute('data-finish', 'marble');
  });

  it('spreads the artwork across the face for a picture disc and drops the label', () => {
    useUIStore.setState({ vinylFinish: 'picture' });

    const { container } = render(<VinylRecord albumArt="art://cover.jpg" albumAlt="Late Nights" />);

    expect(screen.getByAltText('Late Nights')).toHaveAttribute('src', 'art://cover.jpg');
    expect(container.querySelector('.vinyl-label')).not.toBeInTheDocument();
    expect(container.querySelector('.vinyl-picture-grooves')).toBeInTheDocument();
  });

  it('keeps the center label on a picture disc when there is no artwork to spread', () => {
    useUIStore.setState({ vinylFinish: 'picture' });

    const { container } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('.vinyl-picture-grooves')).not.toBeInTheDocument();
    expect(container.querySelector('.vinyl-label')).toHaveTextContent('白波');
  });

  it('mounts the tonearm only when enabled, lifted while paused', () => {
    const { container, rerender } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('[data-slot="vinyl-tonearm"]')).not.toBeInTheDocument();

    useUIStore.setState({ vinylTonearmEnabled: true });
    rerender(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    const tonearm = container.querySelector('[data-slot="vinyl-tonearm"]');
    expect(tonearm).toHaveAttribute('data-resting', 'false');
  });

  it('rests the tonearm on the groove while playing', () => {
    usePlaybackStore.setState({ isPlaying: true });
    useUIStore.setState({ vinylTonearmEnabled: true });

    const { container } = render(<VinylRecord albumArt={null} albumAlt="Late Nights" />);

    expect(container.querySelector('[data-slot="vinyl-tonearm"]')).toHaveAttribute(
      'data-resting',
      'true'
    );
  });
});
