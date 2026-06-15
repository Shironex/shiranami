import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import VisualizerStyleGrid from './VisualizerStyleGrid';

describe('VisualizerStyleGrid', () => {
  it('renders a tile per registered style and marks the active one', () => {
    render(<VisualizerStyleGrid value="bars" onSelect={vi.fn()} />);

    const bars = screen.getByRole('button', { name: /Bars/ });
    expect(bars).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Waveform/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('calls onSelect with the chosen style', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VisualizerStyleGrid value="bars" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Waveform/ }));

    expect(onSelect).toHaveBeenCalledWith('waveform');
  });

  it('hides descriptions in compact mode', () => {
    render(<VisualizerStyleGrid value="bars" onSelect={vi.fn()} compact />);

    expect(screen.queryByText('Soft frequency bars')).not.toBeInTheDocument();
  });
});
