import { useTranslation } from 'react-i18next';
import type { ISmartPlaylistCardProps, ISmartPlaylistCardView } from './SmartPlaylistCard.types';

/**
 * SmartPlaylistCard is a purely presentational card; the hook binds the
 * `smartPlaylists` translator, resolves the pluralized rule-count summary, and
 * closes `onOpen` over the playlist id so the shell renders without computing
 * anything.
 */
export function useSmartPlaylistCard({
  playlist,
  onOpen,
}: ISmartPlaylistCardProps): ISmartPlaylistCardView {
  const { t } = useTranslation('smartPlaylists');

  return {
    name: playlist.name,
    ruleSummary: t('ruleSummary', { count: playlist.rules.length }),
    onOpen: () => onOpen(playlist.id),
  };
}
