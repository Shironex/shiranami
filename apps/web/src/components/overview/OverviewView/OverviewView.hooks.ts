import { useTranslation } from 'react-i18next';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useViewStore } from '@/stores/useViewStore';
import { useOverviewData } from '@/hooks/useOverviewData';
import { useWeeklyRecap } from '@/hooks/useWeeklyRecap';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import type { IOverviewView } from './OverviewView.types';

export function useOverviewView(): IOverviewView {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');
  const {
    summary,
    heatmap,
    topAlbums,
    sessionCount,
    trendDeltaMinutes,
    recentlyAdded,
    newInLibraryCount,
    hasLibrary,
    hasHistory,
    libraryLoaded,
    isLoading,
    isError,
    refetch,
    handlePlayTrack,
  } = useOverviewData();
  const { handleOpenFolder } = useLibraryActions();
  const navigateTo = useViewStore(s => s.navigateTo);
  const { recap, visible: showRecap } = useWeeklyRecap();
  const showStats = useInterfaceStore(s => s.overviewStats);
  const showTopWeek = useInterfaceStore(s => s.overviewTopWeek);
  const showClock = useInterfaceStore(s => s.overviewClock);
  const showTopAlbums = useInterfaceStore(s => s.overviewTopAlbums);
  const showMixes = useInterfaceStore(s => s.overviewMixes);
  const showRecommendations = useInterfaceStore(s => s.overviewRecommendations);
  const showRecentlyAdded = useInterfaceStore(s => s.overviewRecentlyAdded);

  // The week grid collapses to one column when either side is hidden, so a lone
  // widget never floats beside an empty grid track.
  const showRightColumn = showClock || showTopAlbums;
  const showWeekGrid = showTopWeek || showRightColumn;
  const showRecents = showRecentlyAdded && recentlyAdded.length > 0;

  return {
    summary,
    heatmap,
    topAlbums,
    sessionCount,
    trendDeltaMinutes,
    recentlyAdded,
    newInLibraryCount,
    hasLibrary,
    hasHistory,
    libraryLoaded,
    isLoading,
    isError,
    recap,
    showRecap,
    showStats,
    showTopWeek,
    showClock,
    showTopAlbums,
    showMixes,
    showRecommendations,
    showRightColumn,
    showWeekGrid,
    showRecents,
    copy: {
      errorTitle: t('errorTitle'),
      errorSubtitle: t('errorSubtitle'),
      retryLabel: tCommon('retry'),
      firstRunTitle: t('firstRunTitle'),
      firstRunSubtitle: t('firstRunSubtitle'),
      firstRunAction: t('firstRunAction'),
      emptySectionTitle: t('emptySectionTitle'),
      emptySectionCopy: t('emptySectionCopy'),
    },
    handlePlayTrack,
    onRetry: () => {
      void refetch();
    },
    onOpenFolder: () => void handleOpenFolder(),
    onNavigateLibrary: () => navigateTo('library'),
    onNavigateHistory: () => navigateTo('history'),
  };
}
