import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  ListPlus,
  Heart,
  Share2,
  FolderOpen,
  Trash2,
  Disc3,
  Pencil,
  Radio,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { useTrackContextMenu } from './TrackContextMenu.hooks';
import type { ITrackContextMenuProps } from './TrackContextMenu.types';
import { PlaylistSubmenu } from './PlaylistSubmenu';

interface IMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  title?: string;
}

function MenuItem({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  title,
}: IMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-disabled={disabled || undefined}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
        disabled
          ? 'text-muted-foreground/50 cursor-not-allowed'
          : variant === 'destructive'
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-foreground/80 hover:text-foreground hover:bg-accent'
      )}
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
        {icon}
      </span>
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-border/50" />;
}

export default function TrackContextMenu(props: ITrackContextMenuProps) {
  const {
    t,
    menuRef,
    adjustedPosition,
    isBulk,
    count,
    targetTrackIds,
    isFavorite,
    isBulkEnriching,
    onPlayNext,
    onAddToQueue,
    onToggleFavorite,
    onMoreLikeThis,
    onNotInterested,
    onShowInFolder,
    onShare,
    onFindMissingMetadata,
    onEditTags,
    onRemoveFromLibrary,
    onDeleteFromDisk,
    onClearAndClose,
  } = useTrackContextMenu(props);

  const favoriteLabel = isBulk
    ? t('toggleFavorites')
    : isFavorite
      ? t('removeFromFavorites')
      : t('addToFavorites');
  const showInFolderLabel = IS_MAC ? t('showInFinder') : t('showInExplorer');
  const removeFromLibraryLabel = isBulk
    ? t('removeFromLibraryCount', { count })
    : t('removeFromLibrary');
  const deleteFromDiskLabel = isBulk ? t('deleteFromDiskCount', { count }) : t('deleteFromDisk');

  // Single-track-only actions are gated on Electron + non-bulk. Lifted out of
  // JSX so each render path is a plain `{flag && <X/>}` (no chained logicals
  // inside the markup).
  const showSingleTrackActions = IS_ELECTRON && !isBulk;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.12 }}
        className="fixed z-50 min-w-[200px] py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/30"
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          transformOrigin: 'top left',
        }}
        onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      >
        {isBulk && (
          <>
            <div className="px-3 py-1.5 text-xs text-muted-foreground/50 font-medium">
              {t('selectedCount', { count })}
            </div>
            <Divider />
          </>
        )}

        <MenuItem icon={<Play className="w-4 h-4" />} label={t('playNext')} onClick={onPlayNext} />
        <MenuItem
          icon={<ListPlus className="w-4 h-4" />}
          label={t('addToQueue')}
          onClick={onAddToQueue}
        />

        {showSingleTrackActions && (
          <MenuItem
            icon={<Radio className="w-4 h-4" />}
            label={t('moreLikeThis')}
            onClick={onMoreLikeThis}
          />
        )}

        {showSingleTrackActions && (
          <MenuItem
            icon={<ThumbsDown className="w-4 h-4" />}
            label={t('notInterested')}
            onClick={onNotInterested}
          />
        )}

        <Divider />

        <PlaylistSubmenu trackIds={targetTrackIds} onClose={onClearAndClose} />

        <MenuItem
          icon={
            <Heart
              className={cn('w-4 h-4', !isBulk && isFavorite && 'fill-current text-favorite')}
            />
          }
          label={favoriteLabel}
          onClick={onToggleFavorite}
        />

        {showSingleTrackActions && (
          <MenuItem
            icon={<Share2 className="w-4 h-4" />}
            label={t('share', { ns: 'share' })}
            onClick={onShare}
          />
        )}

        {showSingleTrackActions && (
          <MenuItem
            icon={<Disc3 className="w-4 h-4" />}
            label={t('findMissingMetadata')}
            disabled={isBulkEnriching}
            title={isBulkEnriching ? t('findMissingMetadataBusy') : undefined}
            onClick={onFindMissingMetadata}
          />
        )}

        {showSingleTrackActions && (
          <MenuItem
            icon={<Pencil className="w-4 h-4" />}
            label={t('editTags')}
            onClick={onEditTags}
          />
        )}

        <Divider />

        {showSingleTrackActions && (
          <MenuItem
            icon={<FolderOpen className="w-4 h-4" />}
            label={showInFolderLabel}
            onClick={onShowInFolder}
          />
        )}

        <MenuItem
          icon={<Trash2 className="w-4 h-4" />}
          label={removeFromLibraryLabel}
          onClick={onRemoveFromLibrary}
          variant="destructive"
        />
        {IS_ELECTRON && (
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label={deleteFromDiskLabel}
            onClick={onDeleteFromDisk}
            variant="destructive"
          />
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
