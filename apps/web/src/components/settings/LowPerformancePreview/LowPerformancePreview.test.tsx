import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LowPerformancePreview from './LowPerformancePreview';

const VISUALIZER = '.grid';

describe('LowPerformancePreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<LowPerformancePreview enabled={false} />);

    expect(screen.getByRole('img', { name: 'Performance preview' })).toBeInTheDocument();
  });

  it('renders the full eight-band equalizer mock', () => {
    const { container } = render(<LowPerformancePreview enabled={false} />);

    expect(container.querySelector(VISUALIZER)?.children).toHaveLength(8);
  });

  it('reports full rendering and keeps the visualizer bright when the mode is off', () => {
    const { container } = render(<LowPerformancePreview enabled={false} />);

    expect(screen.getByText('Full visualizer')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(container.querySelector(VISUALIZER)).not.toHaveClass('opacity-35');
  });

  it('reports reduced rendering and dims the visualizer when the mode is on', () => {
    const { container } = render(<LowPerformancePreview enabled />);

    expect(screen.getByText('Reduced rendering')).toBeInTheDocument();
    expect(screen.getByText('Reduced')).toBeInTheDocument();
    expect(container.querySelector(VISUALIZER)).toHaveClass('opacity-35');
  });

  it('recolors the badge to amber while the mode is on', () => {
    render(<LowPerformancePreview enabled />);

    expect(screen.getByText('Reduced')).toHaveClass('bg-amber-500/15', 'text-amber-200');
  });
});
