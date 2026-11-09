import { useCallback, useEffect, useRef, useState } from 'react';
import { searchYouTube, suggestYouTube } from '@/lib/api';
import type { SearchResult } from '@/lib/types';
import { searchErrorLine } from '@/lib/youtube-copy';

export function useYouTubeSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The query whose results are on screen, so a retry repeats it. */
  const [searched, setSearched] = useState('');
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Bumped per search, so an older answer arriving late is dropped. */
  const latest = useRef(0);

  // Debounced suggestions, only while no results for this exact text show.
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (query.trim().length < 2 || query === searched) {
      setSuggestions([]);
      return;
    }

    suggestTimer.current = setTimeout(async () => {
      try {
        setSuggestions(await suggestYouTube(query.trim()));
      } catch {
        // Suggestions are optional; a search shows the real error.
      }
    }, 300);

    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [query, searched]);

  const search = useCallback(
    async (q?: string) => {
      const text = (q ?? query).trim();
      if (!text) return;

      const id = ++latest.current;
      if (q) setQuery(q);
      setSearched(q ?? query);
      setLoading(true);
      setError(null);
      setSuggestions([]);
      try {
        const data = await searchYouTube(text);
        if (id === latest.current) setResults(data);
      } catch (err) {
        if (id === latest.current) {
          setResults([]);
          setError(searchErrorLine(err));
        }
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [query]
  );

  const retry = useCallback(() => search(searched || undefined), [search, searched]);

  const clear = useCallback(() => {
    latest.current++;
    setQuery('');
    setSearched('');
    setResults([]);
    setSuggestions([]);
    setError(null);
    setLoading(false);
  }, []);

  return { query, setQuery, searched, results, suggestions, loading, error, search, retry, clear };
}
