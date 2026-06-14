import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiscoverRecommendation } from '@shiranami/contracts';
import { formatRelativeTime } from '../overviewUtils';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useDiscoverDownload } from '@/hooks/useDiscoverDownload';
import { useAudioPreview, type PreviewableItem } from '@/hooks/useAudioPreview';
import { useSearchDependencies } from '@/hooks/useSearchDependencies';
import type {
  IRecommendationsShelfProps,
  IRecommendationsShelfView,
} from './RecommendationsShelf.types';

/** Max items shown per shelf row before the "+N more" affordance. */
const MAX_SHELF_ITEMS = 8;

/**
 * Maps a discover recommendation onto the shared preview shape. Discover items
 * come from a `--flat-playlist` dump, so there's no duration — the player
 * resolves the real length from the stream once it loads.
 */
function toPreviewable(item: DiscoverRecommendation): PreviewableItem {
  return {
    id: item.youtubeId,
    title: item.title,
    uploader: item.uploader,
    duration: 0,
    thumbnail: item.thumbnail,
    url: item.url,
    webpage_url: item.url,
  };
}

export function useRecommendationsShelf({
  hasLibrary,
}: IRecommendationsShelfProps): IRecommendationsShelfView {
  const { i18n } = useTranslation('recommendations');
  const { library, discover, isLoading, isRefreshing, refresh, hasAny } = useRecommendations();
  const { download, statuses } = useDiscoverDownload();
  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview();
  const {
    dependencyState,
    dependenciesSnapshot,
    dependencyInstallStatus,
    dependencyInstallError,
    isDependencyInstallInProgress,
    dependencyInstallProgress,
    dependencyInstallLabel,
    handleInstallDependencies,
  } = useSearchDependencies();
  const headingId = useId();

  // Discover needs yt-dlp (preview stream + download) and ffmpeg (transcode).
  // When they're missing the backend can't fetch a mix, so the same install
  // card search/import use shows instead of a generic empty state. The library
  // section needs no tools (local files), so gating is discover-only.
  const needsInstall = dependencyState === 'needs-install';

  const isStale = library.stale || discover.stale;
  const generatedAt = library.generatedAt ?? discover.generatedAt;
  const updatedAgo = isStale && generatedAt ? formatRelativeTime(generatedAt, i18n.language) : null;

  const librarySlice = library.items.slice(0, MAX_SHELF_ITEMS);
  const libraryExtra = Math.max(0, library.items.length - MAX_SHELF_ITEMS);
  const discoverSlice = discover.items.slice(0, MAX_SHELF_ITEMS);
  const discoverExtra = Math.max(0, discover.items.length - MAX_SHELF_ITEMS);

  return {
    // True first run (no library at all): stay hidden so Overview's welcome
    // empty state owns the surface. Also stay hidden while still loading.
    shouldHide: isLoading || !hasLibrary,
    headingId,
    isRefreshing,
    isStale,
    updatedAgo,
    hasAny,
    needsInstall,
    showEmptyState: !hasAny && !needsInstall,
    showDiscoverSection: hasAny || needsInstall,
    librarySlice,
    libraryExtra,
    discoverSlice,
    discoverExtra,
    statuses,
    previewLoadingId,
    dependencyInstall: {
      ffmpegInstalled: dependenciesSnapshot?.ffmpegInstalled,
      installStatus: dependencyInstallStatus,
      installError: dependencyInstallError,
      isInstallInProgress: isDependencyInstallInProgress,
      installProgress: dependencyInstallProgress,
      installLabel: dependencyInstallLabel,
      onInstall: handleInstallDependencies,
    },
    onRefresh: () => refresh(),
    onDownload: download,
    onPreview: item => handlePreview(toPreviewable(item)),
    isPreviewing: youtubeId => isPreviewPlaying({ id: youtubeId }),
  };
}
