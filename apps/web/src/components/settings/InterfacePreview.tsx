import { useTranslation } from 'react-i18next';
import {
  AudioLines,
  Heart,
  ListMusic,
  Mic2,
  Minimize2,
  Moon,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useInterfaceStore, type InterfaceElementKey } from '@/stores/useInterfaceStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

interface ITopBarPreviewProps {
  /** Whether the language switcher chip group is shown. */
  enabled: boolean;
}

/** Mini top bar: page title, add button, and the collapsible language chips. */
export function TopBarPreview({ enabled }: ITopBarPreviewProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('app.interface.topBarPreview')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.interface.topBarPreview')}
      >
        <div className="mx-auto flex h-10 max-w-[340px] items-center gap-2 rounded-xl border border-border/25 bg-surface/60 px-3">
          <div className="h-2 w-14 rounded-full bg-foreground/25" />
          <div className="flex-1" />
          <div className="h-5 w-12 rounded-md border border-border/30 bg-muted/25" />
          <div
            className={cn(
              'flex items-center gap-0.5 overflow-hidden transition-all duration-300',
              enabled ? 'max-w-16 opacity-100' : 'max-w-0 opacity-0'
            )}
          >
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              EN
            </span>
            <span className="px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
              PL
            </span>
          </div>
          <div className="flex items-center gap-1" aria-hidden="true">
            <div className="size-1.5 rounded-full bg-muted-foreground/30" />
            <div className="size-1.5 rounded-full bg-muted-foreground/30" />
            <div className="size-1.5 rounded-full bg-muted-foreground/30" />
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

/** Fixed bar heights (%) for the layout-mock visualizer strip. */
const LAYOUT_VIZ_BARS = [40, 70, 100, 55, 85, 60, 95, 45, 75];

/**
 * Scaled mock of the app shell reading the real layout store: the side panel
 * and visualizer strip (tinted primary — the movable pieces) jump to their
 * docked slot live as the position settings change.
 */
export function LayoutPreview() {
  const { t } = useTranslation('settings');
  const sidePanelSide = useLayoutStore(s => s.sidePanelSide);
  const visualizerPosition = useLayoutStore(s => s.visualizerPosition);

  const sidePanelMock = (
    <div className="w-9 shrink-0 space-y-1 rounded-md border border-primary/30 bg-primary/15 p-1.5">
      <div className="h-1 w-6 rounded-full bg-primary/40" />
      <div className="h-1 w-5 rounded-full bg-primary/25" />
      <div className="h-1 w-6 rounded-full bg-primary/25" />
    </div>
  );

  const vizBars = LAYOUT_VIZ_BARS.map((h, i) => (
    <div key={i} className="w-1 rounded-sm bg-primary/45" style={{ height: `${h}%` }} />
  ));

  const visualizerMock = (
    <div className="flex h-3.5 shrink-0 items-end justify-center gap-0.5 rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5">
      {vizBars}
    </div>
  );

  return (
    <SettingsPreview title={t('app.interface.layoutPreview')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.interface.layoutPreview')}
      >
        <div className="mx-auto flex h-32 max-w-[360px] gap-1.5 rounded-xl border border-border/25 bg-surface/60 p-2">
          {/* Sidebar — not movable in v1 */}
          <div className="w-8 shrink-0 space-y-1 rounded-md border border-border/25 bg-muted/20 p-1.5">
            <div className="h-1 w-4 rounded-full bg-foreground/25" />
            <div className="h-1 w-5 rounded-full bg-muted-foreground/25" />
            <div className="h-1 w-4 rounded-full bg-muted-foreground/25" />
          </div>

          {/* Player column: top bar / [viz] / content+panel / [viz] / player bar */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-2.5 shrink-0 rounded-md bg-muted/25" />
            {visualizerPosition === 'top' && visualizerMock}
            <div className="flex min-h-0 flex-1 gap-1.5">
              {sidePanelSide === 'left' && sidePanelMock}
              <div className="min-w-0 flex-1 rounded-md border border-border/25 bg-muted/15" />
              {sidePanelSide === 'right' && sidePanelMock}
            </div>
            {visualizerPosition === 'bottom' && visualizerMock}
            <div className="flex h-3.5 shrink-0 items-center justify-center gap-1 rounded-md bg-muted/25">
              <div className="size-1.5 rounded-full bg-foreground/30" />
              <div className="h-1 w-16 rounded-full bg-muted-foreground/30" />
            </div>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

type OverviewWidgetKey = Extract<InterfaceElementKey, `overview${string}`>;
type PlayerElementKey = Extract<InterfaceElementKey, `player${string}`>;

interface IOverviewLayoutPreviewProps {
  /** Widget to spotlight in the mock (mirrors the row hovered in settings). */
  highlightedKey?: OverviewWidgetKey | null;
}

interface IBlockProps {
  visible: boolean;
  highlighted: boolean;
  /** max-h-* class for the expanded state (collapse animates via max-height). */
  expandedClass: string;
  children: React.ReactNode;
  className?: string;
}

/** Collapsible mock block: fades + folds away when its toggle is off. */
function Block({ visible, highlighted, expandedClass, children, className }: IBlockProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg transition-all duration-300',
        visible ? cn(expandedClass, 'opacity-100') : 'max-h-0 opacity-0',
        highlighted && visible && 'ring-1 ring-primary/40 bg-primary/10',
        className
      )}
    >
      {children}
    </div>
  );
}

const OVERVIEW_STATS_TILES = [0, 1, 2, 3];
const OVERVIEW_TOP_WEEK_ROWS = [24, 20, 16];
const OVERVIEW_CLOCK_BARS = [30, 55, 80, 45, 95, 60, 35];
const OVERVIEW_ALBUM_TILES = [0, 1, 2];
const OVERVIEW_MIX_TILES = [0, 1, 2, 3];
const OVERVIEW_REC_TILES = [0, 1, 2, 3, 4];
const OVERVIEW_RECENT_ROWS = [28, 20];

/**
 * Scaled mock of the Overview page that reads the real interface store, so
 * widgets fold away live as the toggles flip. Mirrors SidebarPreview's
 * hover-spotlight wiring: the hovered settings row highlights its block.
 */
export function OverviewLayoutPreview({ highlightedKey = null }: IOverviewLayoutPreviewProps) {
  const { t } = useTranslation('settings');
  const showStats = useInterfaceStore(s => s.overviewStats);
  const showTopWeek = useInterfaceStore(s => s.overviewTopWeek);
  const showClock = useInterfaceStore(s => s.overviewClock);
  const showTopAlbums = useInterfaceStore(s => s.overviewTopAlbums);
  const showMixes = useInterfaceStore(s => s.overviewMixes);
  const showRecommendations = useInterfaceStore(s => s.overviewRecommendations);
  const showRecentlyAdded = useInterfaceStore(s => s.overviewRecentlyAdded);

  const spotlight = (key: OverviewWidgetKey) => highlightedKey === key;
  const showRightColumn = showClock || showTopAlbums;
  const showWeekGrid = showTopWeek || showRightColumn;

  const statsTiles = OVERVIEW_STATS_TILES.map(i => (
    <div key={i} className="h-6 rounded-md border border-border/25 bg-muted/20" />
  ));

  const topWeekRows = OVERVIEW_TOP_WEEK_ROWS.map(w => (
    <div key={w} className="flex items-center gap-1.5">
      <div className="size-3.5 rounded bg-primary/20" />
      <div className="h-1.5 rounded-full bg-foreground/20" style={{ width: `${w * 4}px` }} />
    </div>
  ));

  const clockBars = OVERVIEW_CLOCK_BARS.map((h, i) => (
    <div key={i} className="w-full rounded-sm bg-primary/35" style={{ height: `${h}%` }} />
  ));

  const albumTiles = OVERVIEW_ALBUM_TILES.map(i => (
    <div key={i} className="size-6 rounded-md bg-primary/20" />
  ));

  const mixTiles = OVERVIEW_MIX_TILES.map(i => (
    <div
      key={i}
      className="h-8 w-12 rounded-md border border-border/25 bg-gradient-to-br from-primary/20 to-muted/20"
    />
  ));

  const recTiles = OVERVIEW_REC_TILES.map(i => (
    <div key={i} className="size-7 rounded-md border border-border/25 bg-muted/25" />
  ));

  const recentRows = OVERVIEW_RECENT_ROWS.map(w => (
    <div key={w} className="flex items-center gap-1.5">
      <div className="size-4 rounded bg-muted/35" />
      <div className="h-1.5 rounded-full bg-muted-foreground/25" style={{ width: `${w * 4}px` }} />
    </div>
  ));

  return (
    <SettingsPreview title={t('app.interface.overviewPreview')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.interface.overviewPreview')}
      >
        <div className="mx-auto flex max-w-[360px] flex-col gap-1.5 rounded-xl border border-border/25 bg-surface/60 p-3">
          {/* Greeting hero — always shown, not toggleable */}
          <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-primary/15 to-transparent px-2">
            <div className="size-5 rounded-full bg-primary/30" />
            <div className="space-y-1">
              <div className="h-1.5 w-20 rounded-full bg-foreground/25" />
              <div className="h-1 w-14 rounded-full bg-muted-foreground/25" />
            </div>
          </div>

          {/* Stats strip */}
          <Block
            visible={showStats}
            highlighted={spotlight('overviewStats')}
            expandedClass="max-h-8"
          >
            <div className="grid grid-cols-4 gap-1.5 p-0.5">{statsTiles}</div>
          </Block>

          {/* Week grid: top tracks + clock/albums column */}
          {showWeekGrid && (
            <div className="flex gap-1.5">
              <Block
                visible={showTopWeek}
                highlighted={spotlight('overviewTopWeek')}
                expandedClass="max-h-24"
                className="flex-[1.3] border border-border/25 bg-muted/15"
              >
                <div className="space-y-1.5 p-2">{topWeekRows}</div>
              </Block>
              {showRightColumn && (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Block
                    visible={showClock}
                    highlighted={spotlight('overviewClock')}
                    expandedClass="max-h-11"
                    className="border border-border/25 bg-muted/15"
                  >
                    <div className="flex h-10 items-end justify-between gap-0.5 px-2 pb-1.5 pt-2">
                      {clockBars}
                    </div>
                  </Block>
                  <Block
                    visible={showTopAlbums}
                    highlighted={spotlight('overviewTopAlbums')}
                    expandedClass="max-h-11"
                    className="border border-border/25 bg-muted/15"
                  >
                    <div className="flex gap-1.5 p-2">{albumTiles}</div>
                  </Block>
                </div>
              )}
            </div>
          )}

          {/* Smart mixes shelf */}
          <Block
            visible={showMixes}
            highlighted={spotlight('overviewMixes')}
            expandedClass="max-h-10"
          >
            <div className="flex gap-1.5 p-0.5">{mixTiles}</div>
          </Block>

          {/* Recommendations shelf */}
          <Block
            visible={showRecommendations}
            highlighted={spotlight('overviewRecommendations')}
            expandedClass="max-h-9"
          >
            <div className="flex gap-1.5 p-0.5">{recTiles}</div>
          </Block>

          {/* Recently added rows */}
          <Block
            visible={showRecentlyAdded}
            highlighted={spotlight('overviewRecentlyAdded')}
            expandedClass="max-h-12"
          >
            <div className="space-y-1.5 p-0.5">{recentRows}</div>
          </Block>
        </div>
      </div>
    </SettingsPreview>
  );
}

interface IPlayerBarPreviewProps {
  /** Element to spotlight in the mock (mirrors the row hovered in settings). */
  highlightedKey?: PlayerElementKey | null;
}

/** Fixed bar heights (%) for the mini waveform seek mock. */
const PREVIEW_WAVE_BARS = [
  30, 55, 40, 70, 50, 85, 45, 65, 90, 50, 60, 40, 75, 55, 95, 45, 70, 50, 80, 40, 60, 35, 50, 30,
];

/** Fraction of the waveform that reads as "played" (tinted primary). */
const WAVE_PLAYED_FRACTION = 0.38;

const PLAYER_UTILITY_ICONS: Array<{ key: PlayerElementKey; Icon: typeof Moon }> = [
  { key: 'playerSleepTimer', Icon: Moon },
  { key: 'playerEqualizer', Icon: SlidersHorizontal },
  { key: 'playerCompactButton', Icon: Minimize2 },
  { key: 'playerVisualizerButton', Icon: AudioLines },
  { key: 'playerLyricsButton', Icon: Mic2 },
  { key: 'playerQueueButton', Icon: ListMusic },
];

interface IElProps {
  visible: boolean;
  highlighted: boolean;
  /** max-w-* class for the expanded state (collapse animates via max-width). */
  expandedClass: string;
  children: React.ReactNode;
  className?: string;
}

/** Horizontally-collapsible mock element (the player-bar analog of Block). */
function El({ visible, highlighted, expandedClass, children, className }: IElProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center overflow-hidden rounded-md transition-all duration-300',
        visible ? cn(expandedClass, 'opacity-100') : 'max-w-0 opacity-0',
        highlighted && visible && 'ring-1 ring-primary/40 bg-primary/10',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Scaled mock of the player bar reading the real interface store: hidden
 * elements collapse away live, hovered settings rows spotlight their element.
 * Core controls (prev/play/next, seek) render unconditionally, matching the
 * real bar.
 */
export function PlayerBarPreview({ highlightedKey = null }: IPlayerBarPreviewProps) {
  const { t } = useTranslation('settings');
  const s = useInterfaceStore();
  const spotlight = (key: PlayerElementKey) => highlightedKey === key;

  const waveBars = PREVIEW_WAVE_BARS.map((h, i) => (
    <div
      key={i}
      className={cn(
        'flex-1 rounded-full',
        i / PREVIEW_WAVE_BARS.length < WAVE_PLAYED_FRACTION
          ? 'bg-primary/60'
          : 'bg-muted-foreground/35'
      )}
      style={{ height: `${h}%` }}
    />
  ));

  const utilityButtons = PLAYER_UTILITY_ICONS.map(({ key, Icon }) => (
    <El
      key={key}
      visible={s[key]}
      highlighted={spotlight(key)}
      expandedClass="max-w-6"
      className="p-1"
    >
      <Icon className="size-3 text-muted-foreground/70" />
    </El>
  ));

  return (
    <SettingsPreview title={t('app.interface.playerPreview')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.interface.playerPreview')}
      >
        {/* Full width on purpose (unlike the capped sibling mocks): the bar
            packs ~330px of fixed-width elements, so any tighter cap starves
            the flex-1 seek section into a centered clump. */}
        <div className="flex h-14 w-full items-center gap-2 rounded-xl border border-border/25 bg-surface/60 px-3">
          {/* Left: album art + title + favorite */}
          <El
            visible={s.playerAlbumArt}
            highlighted={spotlight('playerAlbumArt')}
            expandedClass="max-w-10"
          >
            <div className="size-8 rounded-md bg-primary/20" />
          </El>
          <div className="min-w-0 space-y-1">
            <div className="h-1.5 w-16 rounded-full bg-foreground/25" />
            <div className="h-1 w-11 rounded-full bg-muted-foreground/25" />
          </div>
          <El
            visible={s.playerFavorite}
            highlighted={spotlight('playerFavorite')}
            expandedClass="max-w-6"
            className="p-1"
          >
            <Heart className="size-3 fill-favorite/70 text-favorite/70" />
          </El>

          {/* Center: controls + seek (always shown) */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
            <div className="flex items-center gap-1.5">
              <SkipBack className="size-2.5 text-muted-foreground/60" />
              <div className="grid size-5 place-items-center rounded-full bg-primary/35">
                <Play className="size-2 fill-foreground/80 text-foreground/80" />
              </div>
              <SkipForward className="size-2.5 text-muted-foreground/60" />
            </div>
            <div className="flex w-full items-center gap-1.5">
              <El
                visible={s.playerTimeLabels}
                highlighted={spotlight('playerTimeLabels')}
                expandedClass="max-w-8"
                className="px-0.5"
              >
                <span className="text-[8px] tabular-nums text-muted-foreground/70">1:24</span>
              </El>
              {s.playerWaveformSeekbar ? (
                <div
                  className={cn(
                    'flex h-4 min-w-0 flex-1 items-center gap-px rounded-md px-0.5 transition-all duration-300',
                    spotlight('playerWaveformSeekbar') && 'bg-primary/10 ring-1 ring-primary/40'
                  )}
                >
                  {waveBars}
                </div>
              ) : (
                <div
                  className={cn(
                    'h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/35 transition-all duration-300',
                    spotlight('playerWaveformSeekbar') && 'ring-1 ring-primary/40'
                  )}
                >
                  <div className="h-full w-[38%] rounded-full bg-primary/55" />
                </div>
              )}
              <El
                visible={s.playerTimeLabels}
                highlighted={spotlight('playerTimeLabels')}
                expandedClass="max-w-8"
                className="px-0.5"
              >
                <span className="text-[8px] tabular-nums text-muted-foreground/70">3:45</span>
              </El>
            </div>
          </div>

          {/* Right: utility buttons + volume */}
          <div className="flex items-center gap-0.5">
            {utilityButtons}
            <El
              visible={s.playerVolume}
              highlighted={spotlight('playerVolume')}
              expandedClass="max-w-14"
              className="gap-1 p-1"
            >
              <Volume2 className="size-3 shrink-0 text-muted-foreground/70" />
              <div className="h-1 w-7 shrink-0 overflow-hidden rounded-full bg-muted/35">
                <div className="h-full w-2/3 rounded-full bg-foreground/40" />
              </div>
            </El>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
