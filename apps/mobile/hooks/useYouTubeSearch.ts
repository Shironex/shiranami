import { useCallback, useEffect, useRef, useState } from 'react';
import { searchYouTube, suggestYouTube } from '@/lib/api';
import type { SearchResult } from '@/lib/types';

export function useYouTubeSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced suggestions
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await suggestYouTube(query);
        setSuggestions(data);
      } catch {
        // Silently fail — suggestions are optional
      }
    }, 300);

    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [query]);

  const search = useCallback(
    async (q: string | undefined = undefined) => {
      const searchQuery = q ?? query;
      if (!searchQuery.trim()) return;

      setLoading(true);
      setError(null);
      setSuggestions([]);
      try {
        const data = await searchYouTube(searchQuery.trim());
        setResults(data);
        if (q) setQuery(q);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setError(null);
  }, []);

  return { query, setQuery, results, suggestions, loading, error, search, clear };
}
