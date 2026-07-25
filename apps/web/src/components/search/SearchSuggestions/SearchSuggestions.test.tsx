import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SearchSuggestions from './SearchSuggestions';
import type { ISearchSuggestionsProps } from './SearchSuggestions.types';

const SUGGESTIONS = ['lofi beats', 'lofi hip hop', 'lofi study'];

function renderSuggestions(overrides: Partial<ISearchSuggestionsProps> = {}) {
  const setHighlightedIndex = overrides.setHighlightedIndex ?? vi.fn();
  const onSelect = overrides.onSelect ?? vi.fn();

  return {
    setHighlightedIndex,
    onSelect,
    ...render(
      <SearchSuggestions
        suggestions={overrides.suggestions ?? SUGGESTIONS}
        highlightedIndex={overrides.highlightedIndex ?? -1}
        setHighlightedIndex={setHighlightedIndex}
        onSelect={onSelect}
      />
    ),
  };
}

describe('SearchSuggestions', () => {
  it('renders one listbox option per suggestion, in order', () => {
    renderSuggestions();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options.map(option => option.textContent)).toEqual(SUGGESTIONS);
  });

  it('marks only the highlighted option as selected', () => {
    renderSuggestions({ highlightedIndex: 1 });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('marks no option as selected when nothing is highlighted', () => {
    renderSuggestions({ highlightedIndex: -1 });

    for (const option of screen.getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('applies the active styling to the highlighted option only', () => {
    renderSuggestions({ highlightedIndex: 2 });

    const options = screen.getAllByRole('option');
    expect(options[2].className).toContain('bg-accent');
    expect(options[0].className).toContain('hover:bg-accent/50');
  });

  it('commits the clicked suggestion', () => {
    const { onSelect } = renderSuggestions();

    fireEvent.mouseDown(screen.getByText('lofi hip hop'));

    expect(onSelect).toHaveBeenCalledWith('lofi hip hop');
  });

  it('suppresses the mousedown default so the input keeps focus', () => {
    renderSuggestions();

    const option = screen.getAllByRole('option')[0];
    const mouseDown = createEvent.mouseDown(option);
    fireEvent(option, mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it('moves the highlight to the hovered option', () => {
    const { setHighlightedIndex } = renderSuggestions();

    fireEvent.mouseOver(screen.getAllByRole('option')[2]);

    expect(setHighlightedIndex).toHaveBeenCalledWith(2);
  });

  it('renders an empty listbox when there is nothing to suggest', () => {
    renderSuggestions({ suggestions: [] });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
