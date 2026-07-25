import type { MouseEvent } from 'react';

export interface ISearchSuggestionsProps {
  /** Suggestion strings offered beneath the search input. */
  readonly suggestions: readonly string[];
  /** Index of the highlighted suggestion, or `-1` when none is highlighted. */
  readonly highlightedIndex: number;
  /** Move the highlight, so hovering and arrow-keying agree. */
  readonly setHighlightedIndex: (index: number) => void;
  /** Commit a suggestion as the active query. */
  readonly onSelect: (suggestion: string) => void;
}

export interface ISearchSuggestionItem {
  /** Suggestion text rendered inside the option. */
  readonly suggestion: string;
  /** Whether this option carries the highlight (`aria-selected`). */
  readonly isHighlighted: boolean;
  /** Resolved option classes for the highlighted vs. idle appearance. */
  readonly className: string;
  /** Commits this suggestion without letting the input lose focus first. */
  readonly onMouseDown: (event: MouseEvent<HTMLLIElement>) => void;
  /** Moves the highlight onto this option. */
  readonly onMouseEnter: () => void;
}

export interface ISearchSuggestionsView {
  /** One ready-to-render entry per suggestion, in offer order. */
  readonly items: readonly ISearchSuggestionItem[];
}
