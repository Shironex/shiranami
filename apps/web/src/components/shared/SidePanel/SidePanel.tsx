import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PanelResizeHandle } from '@/components/shared/PanelResizeHandle';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX } from '@/stores/usePanelSizeStore';
import { PANEL_SLIDE_OFFSET, PANEL_TRANSITION } from '@/lib/motion';
import { useSidePanel } from './SidePanel.hooks';
import { SidePanelSkeleton } from './SidePanelSkeleton';
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
    reducedMotion,
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
        <IconButton onClick={onFlip} aria-label={flipLabel}>
          <FlipIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent side="bottom">{flipLabel}</TooltipContent>
    </Tooltip>
  );

  // A gentle fade + slide from the docked edge; width stays static so the
  // resize handle keeps full control of it. App.tsx wraps the mount site in
  // AnimatePresence so the exit leg plays before unmount.
  const slideOffset = side === 'right' ? PANEL_SLIDE_OFFSET : -PANEL_SLIDE_OFFSET;
  const motionProps = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, x: slideOffset },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: slideOffset },
        transition: PANEL_TRANSITION,
      };

  return (
    <motion.div
      id="player-side-panel"
      className={cn(
        'relative border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30',
        side === 'right' ? 'border-l' : 'border-r'
      )}
      style={{ width: rightPanelWidth }}
      {...motionProps}
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
        <Suspense fallback={<SidePanelSkeleton />}>
          {content === 'lyrics' ? (
            <LyricsPanel headerAction={flipButton} />
          ) : (
            <QueuePanel headerAction={flipButton} />
          )}
        </Suspense>
      </ErrorBoundary>
    </motion.div>
  );
}
