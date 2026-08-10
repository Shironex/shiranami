import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';
import { lyricsPrefKeys } from './useLyrics';

/**
 * The write-back opt-in, split out of `useLyrics` to keep each query file under
 * the four-hook cap.
 *
 * `lyrics.saveFetchedLyrics` lives as an electron-store key rather than in the
 * renderer settings blob for the same reason `lyrics.preferSyncedFromLrclib`
 * does: the backend consumes it, here before it writes anything to disk.
 *
 * It is the only renderer-writable setting that causes the app to write into the
 * user's own music folders, so it is opt-in and the backend refuses at the trait
 * level until it is set — and `lyrics:save-batch` rejects with
 * `lyrics.save_disabled` rather than running to an all-skipped summary.
 */
const SAVE_FETCHED_STORE_KEY = 'lyrics.saveFetchedLyrics';

export function useSaveFetchedLyricsQuery() {
  return useQuery({
    queryKey: lyricsPrefKeys.saveFetched,
    queryFn: async (): Promise<boolean> => {
      const value = await window.electronAPI.store.get<boolean>(SAVE_FETCHED_STORE_KEY);
      // `=== true` and not a truthiness check: an absent key is a user who has
      // never opted in, and the one direction this must never get wrong is
      // reading "unset" as "yes, write into my music folders".
      return value === true;
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity,
  });
}

export function useUpdateSaveFetchedLyricsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (value: boolean) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.store.set(SAVE_FETCHED_STORE_KEY, value);
    },
    // Optimistic flip with rollback, matching the precedence toggle in
    // `useLyrics`: the switch tracks the click, and a failed write restores the
    // previous value synchronously before the invalidate re-syncs.
    onMutate: async value => {
      await queryClient.cancelQueries({ queryKey: lyricsPrefKeys.saveFetched });
      const previous = queryClient.getQueryData<boolean>(lyricsPrefKeys.saveFetched);
      queryClient.setQueryData<boolean>(lyricsPrefKeys.saveFetched, value);
      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context) {
        queryClient.setQueryData(lyricsPrefKeys.saveFetched, context.previous);
      }
      toast.error(i18n.t('failedSaveSettings', { ns: 'toast' }));
      queryClient.invalidateQueries({ queryKey: lyricsPrefKeys.saveFetched });
    },
    // Deliberately does NOT invalidate `lyricsKeys.all`: this setting changes
    // what happens to a *file* after a fetch, never which source wins, so
    // re-resolving the current track would be work with no visible result.
  });
}
