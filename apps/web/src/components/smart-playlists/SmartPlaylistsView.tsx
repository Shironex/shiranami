import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { SmartPlaylist } from '@shiranami/contracts';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useViewStore } from '@/stores/useViewStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { PageHeader } from '@/components/shared/PageHeader';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Loader2 } from 'lucide-react';
import {
  useSmartPlaylistQuery,
  useSmartPlaylistTracksQuery,
  useSmartPlaylistsQuery,
  useDeleteSmartPlaylistMutation,
} from '@/hooks/queries/useSmartPlaylists';
import { SmartPlaylistFormDialog } from './SmartPlaylistFormDialog';
import { SmartPlaylistsViewSkeleton } from './SmartPlaylistsViewSkeleton';

function SmartPlaylistDetail({ id }: { id: string }) {
  const { t } = useTranslation('smartPlaylists');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const selectSmartPlaylist = useViewStore(s => s.selectSmartPlaylist);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);

  const { data: playlist, isLoading: loadingMeta } = useSmartPlaylistQuery(id);
  const { data: tracks = [], isLoading: loadingTracks } = useSmartPlaylistTracksQuery(id);
  const deleteMutation = useDeleteSmartPlaylistMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteRef = useRef<HTMLDivElement>(null);
  useClickOutside(deleteRef, () => setShowDeleteConfirm(false), showDeleteConfirm);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const handlePlayTrack = useCallback(
    (index: number) => setQueue(tracksRef.current, index),
    [setQueue]
  );

  const handleBack = useCallback(() => selectSmartPlaylist(null), [selectSmartPlaylist]);

  const handleDelete = useCallback(async () => {
    if (deleteMutation.isPending) return;
    try {
      await deleteMutation.mutateAsync(id);
      setShowDeleteConfirm(false);
      selectSmartPlaylist(null);
    } catch {
      // Keep the confirm popover open so the user can retry or cancel.
      toast.error(tToast('failedDeleteSmartPlaylist'));
    }
  }, [deleteMutation, id, selectSmartPlaylist, tToast]);

  if (loadingMeta) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <button onClick={handleBack} className="text-xs text-primary hover:underline">
          {t('goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/30 shrink-0">
        <IconButton size="md" onClick={handleBack} aria-label={t('goBack')} title={t('goBack')}>
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif italic text-xl leading-tight text-foreground truncate">
            {playlist.name}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mt-0.5">
            {t('matchCount', { count: tracks.length })}
          </p>
        </div>
        <IconButton
          size="md"
          onClick={() => setEditOpen(true)}
          aria-label={tCommon('edit')}
          title={tCommon('edit')}
        >
          <Pencil />
        </IconButton>
        <div ref={deleteRef} className="relative">
          <IconButton
            size="md"
            onClick={() => setShowDeleteConfirm(v => !v)}
            aria-label={tCommon('delete')}
            title={tCommon('delete')}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </IconButton>
          <AnimatePresence>
            {showDeleteConfirm && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-52 p-3 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
              >
                <p className="text-xs text-foreground/80 mb-2">{t('deleteConfirm')}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
                  >
                    {tCommon('delete')}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {tCommon('cancel')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loadingTracks ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
        </div>
      ) : tracks.length === 0 ? (
        <ViewEmptyState title={t('emptyTitle')} subtitle={t('emptySubtitle')} icon={Sparkles} />
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2 py-1.5">
            <List
              rowCount={tracks.length}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={TrackRow}
              rowProps={{
                queue: tracks,
                currentTrack,
                isPlaying,
                handlePlayTrack,
                onToggleFavorite: toggleFavorite,
                showAddToPlaylist: true,
              }}
            />
          </div>
        </div>
      )}

      <SmartPlaylistFormDialog open={editOpen} onOpenChange={setEditOpen} playlist={playlist} />
    </div>
  );
}

function SmartPlaylistCard({
  playlist,
  onOpen,
}: {
  playlist: SmartPlaylist;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('smartPlaylists');
  return (
    <button
      onClick={() => onOpen(playlist.id)}
      className="flex items-center gap-3 w-full rounded-xl border border-border/40 bg-card/50 p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{playlist.name}</p>
        <p className="text-xs text-muted-foreground">
          {t('ruleSummary', { count: playlist.rules.length })}
        </p>
      </div>
    </button>
  );
}

export function SmartPlaylistsView() {
  const { t } = useTranslation('smartPlaylists');
  const { t: tCommon } = useTranslation('common');
  const selectedId = useViewStore(s => s.selectedSmartPlaylistId);
  const selectSmartPlaylist = useViewStore(s => s.selectSmartPlaylist);
  const { data: playlists = [], isLoading, isError, refetch } = useSmartPlaylistsQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const handleOpen = useCallback((id: string) => selectSmartPlaylist(id), [selectSmartPlaylist]);

  const sorted = useMemo(
    () => [...playlists].sort((a, b) => a.name.localeCompare(b.name)),
    [playlists]
  );

  if (selectedId) {
    return <SmartPlaylistDetail id={selectedId} />;
  }

  if (isLoading) {
    return <SmartPlaylistsViewSkeleton />;
  }

  if (isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={t('errorTitle')}
        subtitle={t('errorSubtitle')}
        icon={AlertCircle}
        action={{
          label: tCommon('retry'),
          onClick: () => {
            void refetch();
          },
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('title')} icon={Sparkles} variant="section" />

      <div className="flex items-center justify-end px-6 py-3 shrink-0">
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          {t('newSmartPlaylist')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <ViewEmptyState
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={Sparkles}
          action={{ label: t('newSmartPlaylist'), onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pb-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map(p => (
              <SmartPlaylistCard key={p.id} playlist={p} onOpen={handleOpen} />
            ))}
          </div>
        </div>
      )}

      <SmartPlaylistFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export default SmartPlaylistsView;
