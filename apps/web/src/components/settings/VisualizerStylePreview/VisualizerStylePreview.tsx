import { Suspense } from 'react';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useVisualizerStylePreview } from './VisualizerStylePreview.hooks';

export default function VisualizerStylePreview() {
  const { title, Visualizer, source } = useVisualizerStylePreview();

  return (
    <SettingsPreview title={title}>
      <div
        className="relative h-[140px] overflow-hidden rounded-xl border border-border/30"
        style={{
          background: 'linear-gradient(135deg, oklch(0.12 0.015 270), oklch(0.09 0.015 255))',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(oklch(1 0 0 / 0.025) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.025) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative h-full">
          <Suspense fallback={null}>
            <Visualizer source={source} active />
          </Suspense>
        </div>
      </div>
    </SettingsPreview>
  );
}
