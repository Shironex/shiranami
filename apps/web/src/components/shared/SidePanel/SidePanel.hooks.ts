import { useTranslation } from 'react-i18next';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useViewStore } from '@/stores/useViewStore';
import { usePanelSizeStore } from '@/stores/usePanelSizeStore';
import { useLayoutStore, type SidePanelSide } from '@/stores/useLayoutStore';
import type { ISidePanelProps, ISidePanelView } from './SidePanel.types';

export function useSidePanel({ side }: ISidePanelProps): ISidePanelView {
  const { t } = useTranslation('common');
  const rightPanel = useViewStore(s => s.rightPanel);
  const rightPanelWidth = usePanelSizeStore(s => s.rightPanelWidth);
  const setRightPanelWidth = usePanelSizeStore(s => s.setRightPanelWidth);
  const resetRightPanelWidth = usePanelSizeStore(s => s.resetRightPanelWidth);
  const setSidePanelSide = useLayoutStore(s => s.setSidePanelSide);

  // App.tsx already gates rendering on rightPanel, but stay self-sufficient:
  // bail before mounting the panel chrome when there is nothing to show.
  const content = rightPanel === 'lyrics' || rightPanel === 'queue' ? rightPanel : null;

  const flipTo: SidePanelSide = side === 'right' ? 'left' : 'right';

  return {
    t,
    shouldRender: content !== null,
    content,
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
