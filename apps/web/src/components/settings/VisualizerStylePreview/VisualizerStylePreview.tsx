import { Suspense } from 'react';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useVisualizerStylePreview } from './VisualizerStylePreview.hooks';

/** Faint blueprint grid: 1px foreground lines every 24px, theme-driven. */
const GRID_LINE = 'color-mix(in oklab, var(--foreground) 2.5%, transparent)';

export default function VisualizerStylePreview() {
  const { title, Visualizer, source } = useVisualizerStylePreview();

  return (
    <SettingsPreview title={title}>
      <PreviewFrame label={title} size="scene">
        {/* Dimmed stage backdrop for the glowing bars, from theme tokens so it
            follows the active palette instead of a hardcoded navy. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, var(--surface), var(--background))' }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(${GRID_LINE} 1px, transparent 1px), linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative h-full">
          <Suspense fallback={null}>
            <Visualizer source={source} active />
          </Suspense>
        </div>
      </PreviewFrame>
    </SettingsPreview>
  );
}
