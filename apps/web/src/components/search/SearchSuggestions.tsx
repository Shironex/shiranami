import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ISearchSuggestionsProps {
  readonly suggestions: readonly string[];
  readonly highlightedIndex: number;
  readonly setHighlightedIndex: (index: number) => void;
  readonly onSelect: (suggestion: string) => void;
}

export function SearchSuggestions({
  suggestions,
  highlightedIndex,
  setHighlightedIndex,
  onSelect,
}: ISearchSuggestionsProps) {
  const items = suggestions.map((suggestion, index) => (
    <li
      key={suggestion}
      role="option"
      aria-selected={index === highlightedIndex}
      className={cn(
        'flex items-center gap-3 px-3.5 py-2.5 text-sm cursor-pointer transition-colors',
        index === highlightedIndex
          ? 'bg-accent text-foreground'
          : 'text-foreground/80 hover:bg-accent/50'
      )}
      onMouseDown={e => {
        e.preventDefault(); // Prevent input blur
        onSelect(suggestion);
      }}
      onMouseEnter={() => setHighlightedIndex(index)}
    >
      <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
      <span className="truncate">{suggestion}</span>
    </li>
  ));

  return (
    <ul
      className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden"
      role="listbox"
    >
      {items}
    </ul>
  );
}
