import type { MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import type {
  ISearchSuggestionItem,
  ISearchSuggestionsProps,
  ISearchSuggestionsView,
} from './SearchSuggestions.types';

/**
 * Derives one entry per suggestion — highlight flag, resolved option classes,
 * and both pointer handlers — so the shell only maps the list into markup.
 */
export function useSearchSuggestions({
  suggestions,
  highlightedIndex,
  setHighlightedIndex,
  onSelect,
}: ISearchSuggestionsProps): ISearchSuggestionsView {
  const items: ISearchSuggestionItem[] = suggestions.map((suggestion, index) => {
    const isHighlighted = index === highlightedIndex;

    return {
      suggestion,
      isHighlighted,
      className: cn(
        'flex items-center gap-3 px-3.5 py-2.5 text-sm cursor-pointer transition-colors',
        isHighlighted ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/50'
      ),
      onMouseDown: (event: MouseEvent<HTMLLIElement>) => {
        // Suppressing the default mousedown keeps focus on the input, so the
        // dropdown does not blur-close before the selection commits.
        event.preventDefault();
        onSelect(suggestion);
      },
      onMouseEnter: () => setHighlightedIndex(index),
    };
  });

  return { items };
}
