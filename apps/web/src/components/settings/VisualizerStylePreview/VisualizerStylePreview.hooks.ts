import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { VISUALIZER_COMPONENTS } from '@/components/player/visualizerRegistry';
import type { FrequencySource } from '@/components/player/visualizer-source';
import type { IVisualizerStylePreviewView } from './VisualizerStylePreview.types';

/**
 * A deterministic, audio-free frequency source so the preview animates without
 * touching the playback engine — two summed sine waves tapered toward the high
 * bins, mirroring the rough shape of real spectrum data.
 */
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

export function useVisualizerStylePreview(): IVisualizerStylePreviewView {
  const { t } = useTranslation('settings');
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const sourceRef = useRef<FrequencySource | null>(null);
  if (sourceRef.current === null) sourceRef.current = createSyntheticSource();

  return {
    title: t('vis.preview'),
    Visualizer: VISUALIZER_COMPONENTS[visualizerStyle],
    source: sourceRef.current,
  };
}
