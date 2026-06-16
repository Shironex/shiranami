import { Suspense } from 'react';
import ErrorBoundary from '@/components/shared/ErrorBoundary/ErrorBoundary';
import { DevProfiler } from '@/components/debug/DevProfiler';
import { useVisualizerStrip } from './VisualizerStrip.hooks';

/**
 * The visualizer strip docked inside <main> (which must stay `relative`).
 * Bottom-docked it occupies the padding gap just above the PlayerBar overlay;
 * top-docked it sits flush under the TopBar (and SupportBanner when shown).
 * Whether it renders at all is gated by App.tsx; this only decides where.
 */
export default function VisualizerStrip() {
  const { Visualizer, containerStyle } = useVisualizerStrip();

  return (
    <div className="absolute left-0 right-0 z-40" style={containerStyle}>
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
