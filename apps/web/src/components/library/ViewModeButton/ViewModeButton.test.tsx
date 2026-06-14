import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { List } from 'lucide-react';

import ViewModeButton from './ViewModeButton';

describe('ViewModeButton', () => {
  it('renders an accessible labelled button reflecting the active state', () => {
    render(<ViewModeButton active onClick={vi.fn()} icon={List} label="Tracks" />);

    const button = screen.getByRole('button', { name: 'Tracks' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('title', 'Tracks');
  });

  it('marks aria-pressed false when inactive', () => {
    render(<ViewModeButton active={false} onClick={vi.fn()} icon={List} label="Albums" />);

    expect(screen.getByRole('button', { name: 'Albums' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('invokes onClick when pressed', () => {
    const onClick = vi.fn();
    render(<ViewModeButton active={false} onClick={onClick} icon={List} label="Tracks" />);

    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
