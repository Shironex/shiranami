import type { CSSProperties } from 'react';
import { PLAYER_BAR_HEIGHT, VISUALIZER_HEIGHT } from '@/lib/layout';
import { VISUALIZER_COMPONENTS } from '@/components/player/visualizerRegistry';
import { useUIStore } from '@/stores/useUIStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import type { IVisualizerStripView } from './VisualizerStrip.types';

/**
 * Resolves the active visualizer component from the selected style and computes
 * the strip's docking position: top-docked sits flush under the TopBar,
 * bottom-docked floats in the padding gap above the PlayerBar overlay.
 */
export function useVisualizerStrip(): IVisualizerStripView {
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const visualizerPosition = useLayoutStore(s => s.visualizerPosition);

  const containerStyle: CSSProperties = {
    height: VISUALIZER_HEIGHT,
    ...(visualizerPosition === 'top' ? { top: 0 } : { bottom: PLAYER_BAR_HEIGHT }),
  };

  return {
    Visualizer: VISUALIZER_COMPONENTS[visualizerStyle],
    containerStyle,
  };
}
