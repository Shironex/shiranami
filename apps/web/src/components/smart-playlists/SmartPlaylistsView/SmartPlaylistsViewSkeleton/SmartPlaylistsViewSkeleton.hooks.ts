import { useTranslation } from 'react-i18next';
import type { ISmartPlaylistsViewSkeletonView } from './SmartPlaylistsViewSkeleton.types';

/**
 * The skeleton takes no props; the hook binds the `smartPlaylists` translator
 * and supplies the placeholder-card keys so the shell stays a logic-free frame
 * that mirrors the loaded grid's layout.
 */
const PLACEHOLDER_COUNT = 6;

const PLACEHOLDER_KEYS: readonly number[] = Array.from(
  { length: PLACEHOLDER_COUNT },
  (_, index) => index
);

export function useSmartPlaylistsViewSkeleton(): ISmartPlaylistsViewSkeletonView {
  const { t } = useTranslation('smartPlaylists');

  return {
    title: t('title'),
    placeholderKeys: PLACEHOLDER_KEYS,
  };
}
