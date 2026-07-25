import { Search } from 'lucide-react';
import { useSearchSuggestions } from './SearchSuggestions.hooks';
import type { ISearchSuggestionsProps } from './SearchSuggestions.types';

export default function SearchSuggestions(props: ISearchSuggestionsProps) {
  const { items } = useSearchSuggestions(props);

  const options = items.map(item => (
    <li
      key={item.suggestion}
      role="option"
      aria-selected={item.isHighlighted}
      className={item.className}
      onMouseDown={item.onMouseDown}
      onMouseEnter={item.onMouseEnter}
    >
      <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
      <span className="truncate">{item.suggestion}</span>
    </li>
  ));

  return (
    <ul
      className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden"
      role="listbox"
    >
      {options}
    </ul>
  );
}
