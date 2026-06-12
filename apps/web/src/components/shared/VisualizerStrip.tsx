import { Suspense } from 'react';
import { PLAYER_BAR_HEIGHT, VISUALIZER_HEIGHT } from '@/lib/layout';
import { VISUALIZER_COMPONENTS } from '@/components/player/visualizerRegistry';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import { DevProfiler } from '@/components/debug/DevProfiler';
import { useUIStore } from '@/stores/useUIStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

/**
 * The visualizer strip docked inside <main> (which must stay `relative`).
 * Bottom-docked it occupies the padding gap just above the PlayerBar overlay;
 * top-docked it sits flush under the TopBar (and SupportBanner when shown).
 * Whether it renders at all is gated by App.tsx; this only decides where.
 */
export function VisualizerStrip() {
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const visualizerPosition = useLayoutStore(s => s.visualizerPosition);
  const Visualizer = VISUALIZER_COMPONENTS[visualizerStyle];

  return (
    <div
      className="absolute left-0 right-0 z-40"
      style={{
        height: VISUALIZER_HEIGHT,
        ...(visualizerPosition === 'top' ? { top: 0 } : { bottom: PLAYER_BAR_HEIGHT }),
      }}
    >
      <ErrorBoundary viewName="Visualizer">
        <Suspense fallback={null}>
          <DevProfiler id="visualizer">
            <Visualizer />
          </DevProfiler>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
