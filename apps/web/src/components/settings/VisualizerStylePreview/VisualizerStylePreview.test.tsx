import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';

import VisualizerStylePreview from './VisualizerStylePreview';

function reset(): void {
  useUIStore.setState({ visualizerStyle: 'bars' });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('VisualizerStylePreview', () => {
  it('renders the preview frame with its title', () => {
    render(<VisualizerStylePreview />);

    // The lazy visualizer canvas suspends in jsdom (fallback={null}); the
    // surrounding preview chrome renders synchronously.
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });
});
