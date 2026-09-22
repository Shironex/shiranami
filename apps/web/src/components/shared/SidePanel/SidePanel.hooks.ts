import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useViewStore } from '@/stores/useViewStore';
import { usePanelSizeStore } from '@/stores/usePanelSizeStore';
import { useLayoutStore, type SidePanelSide } from '@/stores/useLayoutStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ISidePanelProps, ISidePanelView } from './SidePanel.types';

export function useSidePanel({ side }: ISidePanelProps): ISidePanelView {
  const { t } = useTranslation('common');
  const reducedMotion = useReducedMotion();
  const rightPanel = useViewStore(s => s.rightPanel);
  const rightPanelWidth = usePanelSizeStore(s => s.rightPanelWidth);
  const setRightPanelWidth = usePanelSizeStore(s => s.setRightPanelWidth);
  const resetRightPanelWidth = usePanelSizeStore(s => s.resetRightPanelWidth);
  const setSidePanelSide = useLayoutStore(s => s.setSidePanelSide);

  // App.tsx already gates rendering on rightPanel, but stay self-sufficient:
  // bail before mounting the panel chrome when there is nothing to show.
  const liveContent = rightPanel === 'lyrics' || rightPanel === 'queue' ? rightPanel : null;

  // While AnimatePresence plays the exit, the store has already emptied — keep
  // rendering the last content so the panel doesn't blank out mid-animation.
  const lastContentRef = useRef<'lyrics' | 'queue' | null>(null);
  if (liveContent) lastContentRef.current = liveContent;
  const content = liveContent ?? lastContentRef.current;

  const flipTo: SidePanelSide = side === 'right' ? 'left' : 'right';

  return {
    t,
    shouldRender: content !== null,
    content,
    reducedMotion,
    rightPanelWidth,
    side,
    resizeEdge: side === 'right' ? 'left' : 'right',
    flipLabel: t(flipTo === 'left' ? 'movePanelLeft' : 'movePanelRight'),
    FlipIcon: flipTo === 'left' ? PanelLeft : PanelRight,
    onFlip: () => setSidePanelSide(flipTo),
    setRightPanelWidth,
    resetRightPanelWidth,
  };
}
