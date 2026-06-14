import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IFilterOption } from './FilterPopover.types';

import FilterPopover from './FilterPopover';

// cmdk scrolls the active item into view on mount; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const options: IFilterOption[] = [
  { value: 'US', label: 'United States', prefix: '🇺🇸', count: 18234 },
  { value: 'GB', label: 'United Kingdom', prefix: '🇬🇧', count: 4210 },
];

function renderPopover(overrides: Partial<React.ComponentProps<typeof FilterPopover>> = {}) {
  const onSelect = overrides.onSelect ?? vi.fn();
  render(
    <FilterPopover
      label="Country"
      placeholder="All countries"
      searchPlaceholder="Search countries"
      emptyText="No countries found"
      options={options}
      value={null}
      onSelect={onSelect}
      {...overrides}
    />
  );
  return { onSelect };
}

describe('FilterPopover', () => {
  it('shows the placeholder when nothing is selected', () => {
    renderPopover();

    expect(screen.getByRole('button', { name: 'Country' })).toHaveTextContent('All countries');
  });

  it('shows the selected option label on the trigger', () => {
    renderPopover({ value: 'GB' });

    expect(screen.getByRole('button', { name: 'Country' })).toHaveTextContent('United Kingdom');
  });

  it('opens the option list and selects an option', () => {
    const { onSelect } = renderPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Country' }));
    fireEvent.click(screen.getByText('United States'));

    expect(onSelect).toHaveBeenCalledWith('US');
  });

  it('clears the selection when the active option is chosen again', () => {
    const { onSelect } = renderPopover({ value: 'US' });

    fireEvent.click(screen.getByRole('button', { name: 'Country' }));
    fireEvent.click(screen.getByText('United States'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('disables the trigger when disabled', () => {
    renderPopover({ disabled: true, options: [] });

    expect(screen.getByRole('button', { name: 'Country' })).toBeDisabled();
  });
});
