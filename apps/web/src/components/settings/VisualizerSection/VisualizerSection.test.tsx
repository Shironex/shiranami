import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';

import VisualizerSection from './VisualizerSection';

// The live preview pulls in a lazy visualizer canvas + RAF wiring; the grid is
// covered by its own suite. Stub both so this focuses on the section chrome.
vi.mock('@/components/settings/VisualizerStylePreview', () => ({
  VisualizerStylePreview: () => <div data-testid="VisualizerStylePreview" />,
}));
vi.mock('@/components/settings/VisualizerStyleGrid', () => ({
  VisualizerStyleGrid: () => <div data-testid="VisualizerStyleGrid" />,
}));

function reset(): void {
  useUIStore.setState({ showVisualizer: true, visualizerStyle: 'bars' });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('VisualizerSection', () => {
  it('renders the style grid and preview when the visualizer is on', () => {
    render(<VisualizerSection />);

    expect(screen.getByRole('heading', { name: 'Visualizer' })).toBeInTheDocument();
    expect(screen.getByTestId('VisualizerStyleGrid')).toBeInTheDocument();
    expect(screen.getByTestId('VisualizerStylePreview')).toBeInTheDocument();
  });

  it('hides the style controls when the visualizer is off', () => {
    useUIStore.setState({ showVisualizer: false });
    render(<VisualizerSection />);

    expect(screen.queryByTestId('VisualizerStyleGrid')).not.toBeInTheDocument();
  });

  it('toggles the visualizer through the store', async () => {
    const user = userEvent.setup();
    const toggleVisualizer = vi.fn();
    useUIStore.setState({ toggleVisualizer });
    render(<VisualizerSection />);

    await user.click(screen.getByRole('switch', { name: 'Show visualizer' }));

    expect(toggleVisualizer).toHaveBeenCalled();
  });
});
