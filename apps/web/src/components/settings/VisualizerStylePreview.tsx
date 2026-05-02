import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/useAppStore';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { AudioVisualizer } from '@/components/player/AudioVisualizer';
import { WaveformVisualizer } from '@/components/player/WaveformVisualizer';
import { CircleVisualizer } from '@/components/player/CircleVisualizer';
import { ParticleVisualizer } from '@/components/player/ParticleVisualizer';
import type { FrequencySource } from '@/components/player/visualizer-source';

function createSyntheticSource(): FrequencySource {
  let t = 0;
  return {
    binCount: 256,
    read(buf) {
      t += 0.04;
      for (let i = 0; i < buf.length; i++) {
        const x = i / buf.length;
        const a = Math.sin(t + x * 7) * (1 - x);
        const b = Math.sin(t * 1.6 + x * 3.5 + 1.1) * (1 - x * 0.55);
        buf[i] = Math.max(0, Math.min(255, ((a + b) * 0.5 + 0.5) * 255 * 0.65));
      }
      return true;
    },
  };
}

export function VisualizerStylePreview() {
  const { t } = useTranslation('settings');
  const visualizerStyle = useAppStore(s => s.visualizerStyle);
  const sourceRef = useRef<FrequencySource | null>(null);
  if (sourceRef.current === null) sourceRef.current = createSyntheticSource();
  const source = sourceRef.current;

  return (
    <SettingsPreview title={t('vis.preview')}>
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
          {visualizerStyle === 'waveform' ? (
            <WaveformVisualizer source={source} active={true} />
          ) : visualizerStyle === 'circle' ? (
            <CircleVisualizer source={source} active={true} />
          ) : visualizerStyle === 'particles' ? (
            <ParticleVisualizer source={source} active={true} />
          ) : (
            <AudioVisualizer source={source} active={true} />
          )}
        </div>
      </div>
    </SettingsPreview>
  );
}
