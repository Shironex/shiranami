import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import type { Playlist } from '@/types/electron';
import type { Track } from '@/stores/usePlayerStore';

// ── Query Keys ──

export const playlistKeys = {
  all: ['playlists'] as const,
  detail: (id: string) => ['playlists', id] as const,
  tracks: (id: string) => ['playlists', id, 'tracks'] as const,
};

// ── Queries ──

export function usePlaylistsQuery() {
  return useQuery({
    queryKey: playlistKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return [];
      return (await window.electronAPI.db.playlists.getAll()) as Playlist[];
    },
    enabled: IS_ELECTRON,
  });
}

export function usePlaylistQuery(playlistId: string | null) {
  return useQuery({
    queryKey: playlistKeys.detail(playlistId!),
    queryFn: async () => {
      return (await window.electronAPI.db.playlists.get(playlistId!)) as Playlist;
    },
    enabled: !!playlistId && IS_ELECTRON,
  });
}

export function usePlaylistTracksQuery(playlistId: string | null) {
  return useQuery({
    queryKey: playlistKeys.tracks(playlistId!),
    queryFn: async () => {
      return (await window.electronAPI.db.playlists.getTracks(playlistId!)) as Track[];
    },
    enabled: !!playlistId && IS_ELECTRON,
  });
}

// ── Mutations ──

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string }) => {
      return (await window.electronAPI.db.playlists.create(data)) as Playlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
    },
  });
}

export function useUpdatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Playlist> }) => {
      await window.electronAPI.db.playlists.update(id, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      queryClient.invalidateQueries({ queryKey: playlistKeys.detail(id) });
    },
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await window.electronAPI.db.playlists.delete(id);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      queryClient.removeQueries({ queryKey: playlistKeys.detail(id) });
      queryClient.removeQueries({ queryKey: playlistKeys.tracks(id) });
    },
  });
}

export function useAddTrackToPlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, trackIds }: { playlistId: string; trackIds: string[] }) => {
      for (const trackId of trackIds) {
        await window.electronAPI.db.playlists.addTrack(playlistId, trackId);
      }
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.tracks(playlistId) });
    },
  });
}

export function useRemoveTrackFromPlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, trackIds }: { playlistId: string; trackIds: string[] }) => {
      for (const trackId of trackIds) {
        await window.electronAPI.db.playlists.removeTrack(playlistId, trackId);
      }
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.tracks(playlistId) });
    },
  });
}

export function useCreatePlaylistsFromSubfoldersMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subfolders: Array<{ name: string; trackIds: string[] }>) => {
      const created: Playlist[] = [];
      for (const sf of subfolders) {
        const existing = await window.electronAPI.db.playlists.getByName(sf.name);
        if (existing) continue;
        const playlist = await window.electronAPI.db.playlists.createWithTracks({
          name: sf.name,
          trackIds: sf.trackIds,
        });
        created.push(playlist);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
    },
  });
}

export function useReorderPlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, trackIds }: { playlistId: string; trackIds: string[] }) => {
      await window.electronAPI.db.playlists.reorder(playlistId, trackIds);
    },
    onMutate: async ({ playlistId, trackIds }) => {
      await queryClient.cancelQueries({ queryKey: playlistKeys.tracks(playlistId) });
      const previous = queryClient.getQueryData<Track[]>(playlistKeys.tracks(playlistId));

      if (previous) {
        const trackMap = new Map(previous.map((t) => [t.id, t]));
        const reordered = trackIds.map((id) => trackMap.get(id)).filter(Boolean) as Track[];
        queryClient.setQueryData(playlistKeys.tracks(playlistId), reordered);
      }

      return { previous, playlistId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(playlistKeys.tracks(context.playlistId), context.previous);
      }
    },
  });
}
