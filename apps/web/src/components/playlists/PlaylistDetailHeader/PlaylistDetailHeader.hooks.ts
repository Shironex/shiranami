import { useTranslation } from 'react-i18next';
import { formatDuration } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import type {
  IPlaylistDetailHeaderProps,
  IPlaylistDetailHeaderView,
} from './PlaylistDetailHeader.types';

export function usePlaylistDetailHeader(
  props: IPlaylistDetailHeaderProps
): IPlaylistDetailHeaderView {
  const { selectedPlaylistId, totalDuration, cover } = props;
  const { t } = useTranslation('playlists');
  const { t: tShare } = useTranslation('share');
  const { t: tCommon } = useTranslation('common');

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

  const showDuration = totalDuration > 0;
  const showShareButton = IS_ELECTRON && selectedPlaylistId !== null;

  const onShare = (): void => {
    if (!selectedPlaylistId) return;
    window.dispatchEvent(
      new CustomEvent(DIALOG_EVENTS.openShare, {
        detail: { type: 'playlist', id: selectedPlaylistId },
      })
    );
  };

  return {
    t,
    tShare,
    tCommon,
    showDuration,
    durationLabel: showDuration ? formatDuration(totalDuration) : '',
    showShareButton,
    onShare,
    showCoverMenu,
    setShowCoverMenu,
    isUpdatingCover,
    coverMenuRef,
    coverInputRef,
    handleCoverFileSelected,
    handlePickCustomCover,
    handleUseSuggestedCover,
    handleClearCover,
  };
}
