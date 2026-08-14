import { useTranslation } from 'react-i18next';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import type {
  IOverviewBarRow,
  IOverviewLayoutPreviewProps,
  IOverviewLayoutPreviewView,
  OverviewWidgetKey,
} from './OverviewLayoutPreview.types';

const OVERVIEW_STATS_TILES: readonly number[] = [0, 1, 2, 3];
const OVERVIEW_CLOCK_BARS: readonly number[] = [30, 55, 80, 45, 95, 60, 35];
const OVERVIEW_ALBUM_TILES: readonly number[] = [0, 1, 2];
const OVERVIEW_MIX_TILES: readonly number[] = [0, 1, 2, 3];
const OVERVIEW_REC_TILES: readonly number[] = [0, 1, 2, 3, 4];

/** Skeleton bar rows, authored in 4px design units and resolved to pixels. */
const BAR_ROW_UNIT_PX = 4;

function barRows(units: readonly number[]): readonly IOverviewBarRow[] {
  return units.map(unit => ({ key: unit, widthPx: unit * BAR_ROW_UNIT_PX }));
}

const OVERVIEW_TOP_WEEK_ROWS = barRows([24, 20, 16]);
const OVERVIEW_RECENT_ROWS = barRows([28, 20]);
const OVERVIEW_RECAP_ROWS = barRows([30, 22, 14]);

/**
 * Reads the real interface store so the Overview mock folds widgets away live
 * as the toggles flip and reorders blocks as sections are dragged, and
 * resolves the hover spotlight into a per-block flag.
 */
export function useOverviewLayoutPreview({
  highlightedKey = null,
}: IOverviewLayoutPreviewProps): IOverviewLayoutPreviewView {
  const { t } = useTranslation('settings');
  const sectionOrder = useInterfaceStore(s => s.overviewOrder);
  const showRecap = useInterfaceStore(s => s.overviewRecap);
  const showStats = useInterfaceStore(s => s.overviewStats);
  const showTopWeek = useInterfaceStore(s => s.overviewTopWeek);
  const showClock = useInterfaceStore(s => s.overviewClock);
  const showTopAlbums = useInterfaceStore(s => s.overviewTopAlbums);
  const showMixes = useInterfaceStore(s => s.overviewMixes);
  const showRecommendations = useInterfaceStore(s => s.overviewRecommendations);
  const showRecentlyAdded = useInterfaceStore(s => s.overviewRecentlyAdded);

  const spotlight = (key: OverviewWidgetKey) => highlightedKey === key;
  const showRightColumn = showClock || showTopAlbums;

  return {
    title: t('app.interface.overviewPreview'),
    sectionOrder,
    recap: { visible: showRecap, highlighted: spotlight('overviewRecap') },
    stats: { visible: showStats, highlighted: spotlight('overviewStats') },
    topWeek: { visible: showTopWeek, highlighted: spotlight('overviewTopWeek') },
    clock: { visible: showClock, highlighted: spotlight('overviewClock') },
    topAlbums: { visible: showTopAlbums, highlighted: spotlight('overviewTopAlbums') },
    mixes: { visible: showMixes, highlighted: spotlight('overviewMixes') },
    recommendations: {
      visible: showRecommendations,
      highlighted: spotlight('overviewRecommendations'),
    },
    recentlyAdded: { visible: showRecentlyAdded, highlighted: spotlight('overviewRecentlyAdded') },
    showRightColumn,
    showWeekGrid: showTopWeek || showRightColumn,
    statsTiles: OVERVIEW_STATS_TILES,
    topWeekRows: OVERVIEW_TOP_WEEK_ROWS,
    clockBars: OVERVIEW_CLOCK_BARS,
    albumTiles: OVERVIEW_ALBUM_TILES,
    mixTiles: OVERVIEW_MIX_TILES,
    recTiles: OVERVIEW_REC_TILES,
    recentRows: OVERVIEW_RECENT_ROWS,
    recapRows: OVERVIEW_RECAP_ROWS,
  };
}
