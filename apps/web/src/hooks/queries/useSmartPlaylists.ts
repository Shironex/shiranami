import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import type {
  SmartPlaylist,
  SmartPlaylistDefinition,
  SmartPlaylistMatchType,
  SmartPlaylistRule,
} from '@shiranami/contracts';

// ── Query Keys ──

export const smartPlaylistKeys = {
  all: ['smart-playlists'] as const,
  detail: (id: string) => ['smart-playlists', id] as const,
  tracks: (id: string) => ['smart-playlists', id, 'tracks'] as const,
};

export interface SmartPlaylistInput {
  name: string;
  description?: string;
  matchType: SmartPlaylistMatchType;
  rules: SmartPlaylistRule[];
}

// ── Queries ──

export function useSmartPlaylistsQuery() {
  return useQuery({
    queryKey: smartPlaylistKeys.all,
    queryFn: async () => {
      if (!IS_ELECTRON) return [];
      return await window.electronAPI.db.smartPlaylists.getAll();
    },
    enabled: IS_ELECTRON,
  });
}

export function useSmartPlaylistQuery(id: string | null) {
  return useQuery({
    queryKey: smartPlaylistKeys.detail(id!),
    queryFn: async () => {
      return await window.electronAPI.db.smartPlaylists.get(id!);
    },
    enabled: !!id && IS_ELECTRON,
  });
}

export function useSmartPlaylistTracksQuery(id: string | null) {
  return useQuery({
    queryKey: smartPlaylistKeys.tracks(id!),
    queryFn: async () => {
      // Same nullable-column collapse as the playlist/library load paths so
      // null artist/album/duration never render as the literal "null".
      const rows = (await window.electronAPI.db.smartPlaylists.getTracks(id!)) as DbTrackRecord[];
      return mapDbTracksToTracks(rows);
    },
    enabled: !!id && IS_ELECTRON,
  });
}

// ── Mutations ──

export function useCreateSmartPlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SmartPlaylistInput): Promise<SmartPlaylist> => {
      return await window.electronAPI.db.smartPlaylists.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smartPlaylistKeys.all });
    },
  });
}

export function useUpdateSmartPlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SmartPlaylistInput> }) => {
      return await window.electronAPI.db.smartPlaylists.update(id, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: smartPlaylistKeys.all });
      queryClient.invalidateQueries({ queryKey: smartPlaylistKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: smartPlaylistKeys.tracks(id) });
    },
  });
}

export function useDeleteSmartPlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await window.electronAPI.db.smartPlaylists.delete(id);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: smartPlaylistKeys.all });
      queryClient.removeQueries({ queryKey: smartPlaylistKeys.detail(id) });
      queryClient.removeQueries({ queryKey: smartPlaylistKeys.tracks(id) });
    },
  });
}

/** Live preview of how many tracks a (possibly unsaved) definition matches. */
export function useSmartPlaylistPreviewQuery(definition: SmartPlaylistDefinition | null) {
  return useQuery({
    queryKey: ['smart-playlists', 'preview', definition],
    queryFn: async () => {
      const rows = (await window.electronAPI.db.smartPlaylists.preview(
        definition!
      )) as DbTrackRecord[];
      return mapDbTracksToTracks(rows);
    },
    enabled: !!definition && IS_ELECTRON,
  });
}
