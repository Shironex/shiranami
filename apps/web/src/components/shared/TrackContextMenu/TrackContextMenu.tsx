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
import { ContextMenuSurface, Menu, MenuDivider, MenuItem, MenuLabel } from '@/components/ui/menu';
import { useTrackContextMenu } from './TrackContextMenu.hooks';
import type { ITrackContextMenuProps } from './TrackContextMenu.types';
import { PlaylistSubmenu } from './PlaylistSubmenu';

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

  return (
    <ContextMenuSurface menuRef={menuRef} position={adjustedPosition}>
      <Menu autoFocus onRequestClose={props.onClose} aria-label={t('trackMenuAria')}>
        {isBulk && (
          <>
            <MenuLabel>{t('selectedCount', { count })}</MenuLabel>
            <MenuDivider />
          </>
        )}

        <MenuItem icon={<Play className="w-4 h-4" />} onClick={onPlayNext}>
          {t('playNext')}
        </MenuItem>
        <MenuItem icon={<ListPlus className="w-4 h-4" />} onClick={onAddToQueue}>
          {t('addToQueue')}
        </MenuItem>

        {showSingleTrackActions && (
          <MenuItem icon={<Radio className="w-4 h-4" />} onClick={onMoreLikeThis}>
            {t('moreLikeThis')}
          </MenuItem>
        )}

        {showSingleTrackActions && (
          <MenuItem icon={<ThumbsDown className="w-4 h-4" />} onClick={onNotInterested}>
            {t('notInterested')}
          </MenuItem>
        )}

        <MenuDivider />

        <PlaylistSubmenu trackIds={targetTrackIds} onClose={onClearAndClose} />

        <MenuItem
          icon={
            <Heart
              className={cn('w-4 h-4', !isBulk && isFavorite && 'fill-current text-favorite')}
            />
          }
          onClick={onToggleFavorite}
        >
          {favoriteLabel}
        </MenuItem>

        {showSingleTrackActions && (
          <MenuItem icon={<Share2 className="w-4 h-4" />} onClick={onShare}>
            {t('share', { ns: 'share' })}
          </MenuItem>
        )}

        {showSingleTrackActions && (
          <MenuItem
            icon={<Disc3 className="w-4 h-4" />}
            disabled={isBulkEnriching}
            title={isBulkEnriching ? t('findMissingMetadataBusy') : undefined}
            onClick={onFindMissingMetadata}
          >
            {t('findMissingMetadata')}
          </MenuItem>
        )}

        {showSingleTrackActions && (
          <MenuItem icon={<Pencil className="w-4 h-4" />} onClick={onEditTags}>
            {t('editTags')}
          </MenuItem>
        )}

        <MenuDivider />

        {showSingleTrackActions && (
          <MenuItem icon={<FolderOpen className="w-4 h-4" />} onClick={onShowInFolder}>
            {showInFolderLabel}
          </MenuItem>
        )}

        <MenuItem
          icon={<Trash2 className="w-4 h-4" />}
          onClick={onRemoveFromLibrary}
          variant="destructive"
        >
          {removeFromLibraryLabel}
        </MenuItem>
        {IS_ELECTRON && (
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            onClick={onDeleteFromDisk}
            variant="destructive"
          >
            {deleteFromDiskLabel}
          </MenuItem>
        )}
      </Menu>
    </ContextMenuSurface>
  );
}
