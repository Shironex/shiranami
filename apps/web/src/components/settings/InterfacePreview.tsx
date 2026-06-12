import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useInterfaceStore, type InterfaceElementKey } from '@/stores/useInterfaceStore';

interface TopBarPreviewProps {
  /** Whether the language switcher chip group is shown. */
  enabled: boolean;
}

/** Mini top bar: page title, add button, and the collapsible language chips. */
export function TopBarPreview({ enabled }: TopBarPreviewProps) {
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

type OverviewWidgetKey = Exclude<InterfaceElementKey, 'topBarLanguageSwitcher'>;

interface OverviewLayoutPreviewProps {
  /** Widget to spotlight in the mock (mirrors the row hovered in settings). */
  highlightedKey?: OverviewWidgetKey | null;
}

interface BlockProps {
  visible: boolean;
  highlighted: boolean;
  /** max-h-* class for the expanded state (collapse animates via max-height). */
  expandedClass: string;
  children: React.ReactNode;
  className?: string;
}

/** Collapsible mock block: fades + folds away when its toggle is off. */
function Block({ visible, highlighted, expandedClass, children, className }: BlockProps) {
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

/**
 * Scaled mock of the Overview page that reads the real interface store, so
 * widgets fold away live as the toggles flip. Mirrors SidebarPreview's
 * hover-spotlight wiring: the hovered settings row highlights its block.
 */
export function OverviewLayoutPreview({ highlightedKey = null }: OverviewLayoutPreviewProps) {
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
            <div className="grid grid-cols-4 gap-1.5 p-0.5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-6 rounded-md border border-border/25 bg-muted/20" />
              ))}
            </div>
          </Block>

          {/* Week grid: top tracks + clock/albums column */}
          {(showTopWeek || showRightColumn) && (
            <div className="flex gap-1.5">
              <Block
                visible={showTopWeek}
                highlighted={spotlight('overviewTopWeek')}
                expandedClass="max-h-24"
                className="flex-[1.3] border border-border/25 bg-muted/15"
              >
                <div className="space-y-1.5 p-2">
                  {[24, 20, 16].map(w => (
                    <div key={w} className="flex items-center gap-1.5">
                      <div className="size-3.5 rounded bg-primary/20" />
                      <div
                        className="h-1.5 rounded-full bg-foreground/20"
                        style={{ width: `${w * 4}px` }}
                      />
                    </div>
                  ))}
                </div>
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
                      {[30, 55, 80, 45, 95, 60, 35].map((h, i) => (
                        <div
                          key={i}
                          className="w-full rounded-sm bg-primary/35"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </Block>
                  <Block
                    visible={showTopAlbums}
                    highlighted={spotlight('overviewTopAlbums')}
                    expandedClass="max-h-11"
                    className="border border-border/25 bg-muted/15"
                  >
                    <div className="flex gap-1.5 p-2">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="size-6 rounded-md bg-primary/20" />
                      ))}
                    </div>
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
            <div className="flex gap-1.5 p-0.5">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="h-8 w-12 rounded-md border border-border/25 bg-gradient-to-br from-primary/20 to-muted/20"
                />
              ))}
            </div>
          </Block>

          {/* Recommendations shelf */}
          <Block
            visible={showRecommendations}
            highlighted={spotlight('overviewRecommendations')}
            expandedClass="max-h-9"
          >
            <div className="flex gap-1.5 p-0.5">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="size-7 rounded-md border border-border/25 bg-muted/25" />
              ))}
            </div>
          </Block>

          {/* Recently added rows */}
          <Block
            visible={showRecentlyAdded}
            highlighted={spotlight('overviewRecentlyAdded')}
            expandedClass="max-h-12"
          >
            <div className="space-y-1.5 p-0.5">
              {[28, 20].map(w => (
                <div key={w} className="flex items-center gap-1.5">
                  <div className="size-4 rounded bg-muted/35" />
                  <div
                    className="h-1.5 rounded-full bg-muted-foreground/25"
                    style={{ width: `${w * 4}px` }}
                  />
                </div>
              ))}
            </div>
          </Block>
        </div>
      </div>
    </SettingsPreview>
  );
}
