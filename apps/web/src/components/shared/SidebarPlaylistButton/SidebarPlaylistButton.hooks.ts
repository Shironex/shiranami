import type {
  ISidebarPlaylistButtonProps,
  ISidebarPlaylistButtonView,
} from './SidebarPlaylistButton.types';

export function useSidebarPlaylistButton({
  playlist,
  collapsed,
  isActive,
  onNavigate,
  onContextMenu,
}: ISidebarPlaylistButtonProps): ISidebarPlaylistButtonView {
  return {
    playlist,
    collapsed,
    isActive,
    onNavigate,
    onContextMenu: event => {
      event.preventDefault();
      onContextMenu(playlist, { x: event.clientX, y: event.clientY });
    },
  };
}
