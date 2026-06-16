import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

// Stub the lazy visualizer registry with a synchronous component so the strip
// renders without suspending on a code-split chunk.
vi.mock('@/components/player/visualizerRegistry', () => ({
  VISUALIZER_COMPONENTS: {
    bars: () => <div data-testid="visualizer">visualizer</div>,
  },
}));

// ErrorBoundary is imported via its folder barrel (named export); pass children through.
vi.mock('@/components/shared/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import VisualizerStrip from './VisualizerStrip';

afterEach(() => {
  useLayoutStore.setState({ visualizerPosition: 'bottom' });
});

describe('VisualizerStrip', () => {
  it('renders the active visualizer for the selected style', async () => {
    useUIStore.setState({ visualizerStyle: 'bars' });
    useLayoutStore.setState({ visualizerPosition: 'bottom' });

    render(<VisualizerStrip />);

    expect(await screen.findByTestId('visualizer')).toBeInTheDocument();
  });

  it('docks to the top when the position is "top"', async () => {
    useUIStore.setState({ visualizerStyle: 'bars' });
    useLayoutStore.setState({ visualizerPosition: 'top' });

    render(<VisualizerStrip />);

    const strip = (await screen.findByTestId('visualizer')).closest('div.absolute');
    expect(strip).toHaveStyle({ top: '0px' });
  });
});
