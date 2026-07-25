import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '@/stores/useLayoutStore';
import type { ILayoutPreviewView } from './LayoutPreview.types';

/** Fixed bar heights (%) for the layout-mock visualizer strip. */
const LAYOUT_VIZ_BARS: readonly number[] = [40, 70, 100, 55, 85, 60, 95, 45, 75];

/**
 * Reads the real layout store and resolves it into the docked-slot flags the
 * mock renders from, so the shell only places the two movable pieces.
 */
export function useLayoutPreview(): ILayoutPreviewView {
  const { t } = useTranslation('settings');
  const sidePanelSide = useLayoutStore(s => s.sidePanelSide);
  const visualizerPosition = useLayoutStore(s => s.visualizerPosition);

  return {
    title: t('app.interface.layoutPreview'),
    sidePanelOnLeft: sidePanelSide === 'left',
    sidePanelOnRight: sidePanelSide === 'right',
    visualizerOnTop: visualizerPosition === 'top',
    visualizerOnBottom: visualizerPosition === 'bottom',
    vizBarHeights: LAYOUT_VIZ_BARS,
  };
}
