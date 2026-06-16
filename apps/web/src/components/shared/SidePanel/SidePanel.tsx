import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PanelResizeHandle } from '@/components/shared/PanelResizeHandle';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX } from '@/stores/usePanelSizeStore';
import { useSidePanel } from './SidePanel.hooks';
import type { ISidePanelProps } from './SidePanel.types';

const LyricsPanel = lazy(() => import('@/components/lyrics/LyricsPanel/LyricsPanel'));
const QueuePanel = lazy(() => import('@/components/player/QueuePanel/QueuePanel'));

/**
 * The lyrics/queue panel docked beside the center views. Whether it shows (and
 * which content) lives in useViewStore.rightPanel; which side it docks on
 * lives in useLayoutStore; its one shared width lives in usePanelSizeStore.
 */
export default function SidePanel(props: ISidePanelProps) {
  const {
    t,
    shouldRender,
    content,
    rightPanelWidth,
    side,
    resizeEdge,
    flipLabel,
    FlipIcon,
    onFlip,
    setRightPanelWidth,
    resetRightPanelWidth,
  } = useSidePanel(props);

  if (!shouldRender) return null;

  const flipButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onFlip}
          aria-label={flipLabel}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <FlipIcon className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{flipLabel}</TooltipContent>
    </Tooltip>
  );

  return (
    <div
      id="player-side-panel"
      className={cn(
        'relative border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30',
        side === 'right' ? 'border-l' : 'border-r'
      )}
      style={{ width: rightPanelWidth }}
    >
      <PanelResizeHandle
        edge={resizeEdge}
        value={rightPanelWidth}
        min={RIGHT_PANEL_WIDTH_MIN}
        max={RIGHT_PANEL_WIDTH_MAX}
        onChange={setRightPanelWidth}
        onReset={resetRightPanelWidth}
        aria-label={t('resizeRightPanel')}
        aria-controls="player-side-panel"
      />
      <ErrorBoundary viewName="RightPanel">
        <Suspense fallback={null}>
          {content === 'lyrics' ? (
            <LyricsPanel headerAction={flipButton} />
          ) : (
            <QueuePanel headerAction={flipButton} />
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
