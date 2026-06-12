import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PanelResizeHandle } from '@/components/shared/PanelResizeHandle';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import { useViewStore } from '@/stores/useViewStore';
import {
  usePanelSizeStore,
  RIGHT_PANEL_WIDTH_MIN,
  RIGHT_PANEL_WIDTH_MAX,
} from '@/stores/usePanelSizeStore';
import type { SidePanelSide } from '@/stores/useLayoutStore';

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
  const { t } = useTranslation();
  const rightPanel = useViewStore(s => s.rightPanel);
  const rightPanelWidth = usePanelSizeStore(s => s.rightPanelWidth);
  const setRightPanelWidth = usePanelSizeStore(s => s.setRightPanelWidth);
  const resetRightPanelWidth = usePanelSizeStore(s => s.resetRightPanelWidth);

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
        aria-label={t('resizeRightPanel', { ns: 'common' })}
        aria-controls="player-side-panel"
      />
      <ErrorBoundary viewName="RightPanel">
        <Suspense fallback={null}>
          {rightPanel === 'lyrics' ? <LyricsPanel /> : <QueuePanel />}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
