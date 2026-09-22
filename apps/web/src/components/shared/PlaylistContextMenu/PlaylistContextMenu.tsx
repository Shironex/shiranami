import { ListMusic, Play, Shuffle } from 'lucide-react';
import { ContextMenuSurface, Menu, MenuItem } from '@/components/ui/menu';
import { usePlaylistContextMenu } from './PlaylistContextMenu.hooks';
import type { IPlaylistContextMenuProps } from './PlaylistContextMenu.types';

export default function PlaylistContextMenu(props: IPlaylistContextMenuProps) {
  const { t, menuRef, adjustedPosition, onOpen, onPlay, onShuffle } = usePlaylistContextMenu(props);

  return (
    <ContextMenuSurface menuRef={menuRef} position={adjustedPosition}>
      <Menu autoFocus onRequestClose={props.onClose} aria-label={t('playlistMenuAria')}>
        <MenuItem icon={<ListMusic className="w-4 h-4" />} onClick={onOpen}>
          {t('openPlaylist')}
        </MenuItem>
        <MenuItem icon={<Play className="w-4 h-4" />} onClick={onPlay}>
          {t('playPlaylist')}
        </MenuItem>
        <MenuItem icon={<Shuffle className="w-4 h-4" />} onClick={onShuffle}>
          {t('shufflePlaylist')}
        </MenuItem>
      </Menu>
    </ContextMenuSurface>
  );
}
