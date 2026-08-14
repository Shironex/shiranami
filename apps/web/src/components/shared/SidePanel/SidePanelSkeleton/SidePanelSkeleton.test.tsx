import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SidePanelSkeleton from './SidePanelSkeleton';

describe('SidePanelSkeleton', () => {
  it('marks the whole frame busy while a panel chunk loads', () => {
    const { container } = render(<SidePanelSkeleton />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('reserves the header strip so the panel chrome does not shift in', () => {
    const { container } = render(<SidePanelSkeleton />);

    const frame = container.querySelector('[aria-busy="true"]');
    // Header strip + row column.
    expect(frame?.children).toHaveLength(2);
    // Title chip + header-action chip.
    expect(frame?.children[0].children).toHaveLength(2);
  });

  it('sketches six track-shaped placeholder rows', () => {
    const { container } = render(<SidePanelSkeleton />);

    const frame = container.querySelector('[aria-busy="true"]');
    expect(frame?.children[1].children).toHaveLength(6);
  });

  it('renders no readable copy or interactive controls while loading', () => {
    const { container } = render(<SidePanelSkeleton />);

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
