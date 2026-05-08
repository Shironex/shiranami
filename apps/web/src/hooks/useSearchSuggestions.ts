import { useState, useEffect, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';

const DEBOUNCE_MS = 300;

export function useSearchSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queryRef = useRef(query);
  const suppressRef = useRef(false);

  useEffect(() => {
    queryRef.current = query;
    clearTimeout(debounceRef.current);

    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }

    const trimmed = query.trim();
    if (!trimmed || !IS_ELECTRON) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const items = await window.electronAPI.downloader.suggest(trimmed);
        // Only apply if query hasn't changed while we were fetching
        if (queryRef.current.trim() === trimmed) {
          setSuggestions(items);
          setHighlightedIndex(-1);
          setIsOpen(items.length > 0);
        }
      } catch {
        // IPC error — silently ignore
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(debounceRef.current);
    };
  }, [query]);

  const close = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const dismiss = () => {
    suppressRef.current = true;
    close();
  };

  return {
    suggestions,
    highlightedIndex,
    setHighlightedIndex,
    isOpen,
    setIsOpen,
    close,
    dismiss,
  };
}
