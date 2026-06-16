import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';

import AmbientBackground from './AmbientBackground';

afterEach(() => {
  usePlaybackStore.setState({ currentTrack: null });
  useUIStore.setState({ lowPerformanceMode: false, noiseOverlayEnabled: false });
});

describe('AmbientBackground', () => {
  it('renders nothing in low-performance mode', () => {
    useUIStore.setState({ lowPerformanceMode: true, noiseOverlayEnabled: true });

    const { container } = render(<AmbientBackground />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the noise overlay when enabled', () => {
    useUIStore.setState({ lowPerformanceMode: false, noiseOverlayEnabled: true });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('.noise')).not.toBeNull();
  });

  it('omits the noise overlay when disabled', () => {
    useUIStore.setState({ lowPerformanceMode: false, noiseOverlayEnabled: false });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('.noise')).toBeNull();
  });
});
