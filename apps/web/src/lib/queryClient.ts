import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes — local SQLite data, rarely stale
      gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
      retry: 1,
      refetchOnWindowFocus: false, // no network dependency
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
