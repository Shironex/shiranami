import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GridSizeToggle from './GridSizeToggle';

const labels = {
  group: 'Grid size',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

describe('GridSizeToggle', () => {
  it('renders a labelled button group with all three density options', () => {
    render(<GridSizeToggle size="medium" onSizeChange={vi.fn()} labels={labels} />);

    expect(screen.getByRole('group', { name: 'Grid size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Small' })).toBeInTheDocument();
  });

  it('reports the chosen size on click', async () => {
    const user = userEvent.setup();
    const onSizeChange = vi.fn();
    render(<GridSizeToggle size="medium" onSizeChange={onSizeChange} labels={labels} />);

    await user.click(screen.getByRole('button', { name: 'Small' }));

    expect(onSizeChange).toHaveBeenCalledWith('small');
  });
});
