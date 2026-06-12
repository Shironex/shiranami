import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeft, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PanelResizeHandle } from '@/components/shared/PanelResizeHandle';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import { useViewStore } from '@/stores/useViewStore';
import {
  usePanelSizeStore,
  RIGHT_PANEL_WIDTH_MIN,
  RIGHT_PANEL_WIDTH_MAX,
} from '@/stores/usePanelSizeStore';
import { useLayoutStore, type SidePanelSide } from '@/stores/useLayoutStore';

const LyricsPanel = lazy(() => import('@/components/lyrics/LyricsPanel'));
const QueuePanel = lazy(() => import('@/components/player/QueuePanel'));

interface SidePanelProps {
  side: SidePanelSide;
}

/**
 * The lyrics/queue panel docked beside the center views. Whether it shows (and
 * which content) lives in useViewStore.rightPanel; which side it docks on
 * lives in useLayoutStore; its one shared width lives in usePanelSizeStore.
 */
export function SidePanel({ side }: SidePanelProps) {
  const { t } = useTranslation('common');
  const rightPanel = useViewStore(s => s.rightPanel);
  const rightPanelWidth = usePanelSizeStore(s => s.rightPanelWidth);
  const setRightPanelWidth = usePanelSizeStore(s => s.setRightPanelWidth);
  const resetRightPanelWidth = usePanelSizeStore(s => s.resetRightPanelWidth);
  const setSidePanelSide = useLayoutStore(s => s.setSidePanelSide);

  // App.tsx already gates rendering on rightPanel, but stay self-sufficient:
  // bail before mounting the panel chrome when there is nothing to show.
  if (rightPanel !== 'lyrics' && rightPanel !== 'queue') return null;

  const flipTo: SidePanelSide = side === 'right' ? 'left' : 'right';
  const flipLabel = t(flipTo === 'left' ? 'movePanelLeft' : 'movePanelRight');
  const FlipIcon = flipTo === 'left' ? PanelLeft : PanelRight;
  const flipButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setSidePanelSide(flipTo)}
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
        edge={side === 'right' ? 'left' : 'right'}
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
          {rightPanel === 'lyrics' ? (
            <LyricsPanel headerAction={flipButton} />
          ) : (
            <QueuePanel headerAction={flipButton} />
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
