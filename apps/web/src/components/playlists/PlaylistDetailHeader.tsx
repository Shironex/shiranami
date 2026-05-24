import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import {
  ArrowLeft,
  Play,
  Share2,
  Trash2,
  ListMusic,
  Loader2,
  ImagePlus,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { motion, AnimatePresence } from 'motion/react';
import type { Playlist } from '@/types/electron';
import type { usePlaylistCover } from '@/hooks/usePlaylistCover';

type PlaylistCover = ReturnType<typeof usePlaylistCover>;

interface PlaylistDetailHeaderProps {
  playlist: Playlist;
  selectedPlaylistId: string | null;
  trackCount: number;
  totalDuration: number;
  hasTracks: boolean;
  suggestedCoverArt?: string;
  cover: PlaylistCover;
  isEditing: boolean;
  editName: string;
  setEditName: (name: string) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (show: boolean) => void;
  onBack: () => void;
  onPlayAll: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onSaveName: () => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
}

export function PlaylistDetailHeader({
  playlist,
  selectedPlaylistId,
  trackCount,
  totalDuration,
  hasTracks,
  suggestedCoverArt,
  cover,
  isEditing,
  editName,
  setEditName,
  nameInputRef,
  showDeleteConfirm,
  setShowDeleteConfirm,
  onBack,
  onPlayAll,
  onDelete,
  onStartEdit,
  onSaveName,
  onNameKeyDown,
}: PlaylistDetailHeaderProps) {
  const { t } = useTranslation('playlists');
  const {
    showCoverMenu,
    setShowCoverMenu,
    isUpdatingCover,
    coverMenuRef,
    coverInputRef,
    handleCoverFileSelected,
    handlePickCustomCover,
    handleUseSuggestedCover,
    handleClearCover,
  } = cover;

  return (
    <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
      {/* Back + actions row */}
      <div className="flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={t('back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </motion.button>

        <div className="flex-1" />

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onPlayAll}
          disabled={!hasTracks}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {t('playAll')}
        </motion.button>

        {IS_ELECTRON && selectedPlaylistId && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(DIALOG_EVENTS.openShare, {
                  detail: { type: 'playlist', id: selectedPlaylistId },
                })
              );
            }}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t('share', { ns: 'share' })}
          >
            <Share2 className="w-3.5 h-3.5" />
          </motion.button>
        )}

        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label={t('deletePlaylist')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>

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
                    onClick={onDelete}
                    className="flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                  >
                    {t('delete', { ns: 'common' })}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {t('cancel', { ns: 'common' })}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Playlist info */}
      <div className="flex items-center gap-4">
        <div ref={coverMenuRef} className="relative shrink-0">
          <button
            onClick={() => setShowCoverMenu(open => !open)}
            className="group/cover relative w-16 h-16 rounded-xl bg-surface border border-border/30 flex items-center justify-center overflow-hidden"
            disabled={isUpdatingCover}
            title={t('editCover')}
          >
            {playlist.coverArt ? (
              <img
                src={playlist.coverArt}
                alt={playlist.name}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <ListMusic className="w-7 h-7 text-muted-foreground/20" />
            )}

            <div className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/30 transition-colors flex items-center justify-center">
              {isUpdatingCover ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <ImagePlus className="w-4 h-4 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>

          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleCoverFileSelected}
          />

          <AnimatePresence>
            {showCoverMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-2 w-52 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
              >
                <button
                  onClick={handlePickCustomCover}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ImagePlus className="w-4 h-4 text-muted-foreground/60" />
                  {t('uploadCustomImage')}
                </button>

                {suggestedCoverArt && (
                  <button
                    onClick={handleUseSuggestedCover}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-muted-foreground/60" />
                    {t('useTrackArtwork')}
                  </button>
                )}

                {playlist.coverArt && (
                  <button
                    onClick={handleClearCover}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    {t('removeCover')}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              ref={nameInputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={onSaveName}
              onKeyDown={onNameKeyDown}
              aria-label={t('namePlaceholder')}
              className="font-display text-lg font-semibold text-foreground bg-transparent outline-none border-b border-primary/40 w-full pb-0.5"
            />
          ) : (
            <button
              onClick={onStartEdit}
              className="font-display text-lg font-semibold text-foreground truncate block text-left hover:text-primary transition-colors"
              title={t('clickToRename')}
            >
              {playlist.name}
            </button>
          )}
          <p className="text-xs text-muted-foreground/50 mt-0.5">
            {t('trackCount', { count: trackCount })}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
          </p>
        </div>
      </div>
    </div>
  );
}
