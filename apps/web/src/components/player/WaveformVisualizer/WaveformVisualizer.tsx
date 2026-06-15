import { useWaveformVisualizer } from './WaveformVisualizer.hooks';
import type { IWaveformVisualizerProps } from './WaveformVisualizer.types';

/**
 * Dense vertical-bar waveform visualizer inspired by ElevenLabs UI.
 *
 * Renders tightly packed thin bars of varying height that create
 * a barcode/waveform silhouette reacting to audio frequency data.
 */
export default function WaveformVisualizer(props: IWaveformVisualizerProps) {
  const { canvasRef } = useWaveformVisualizer(props);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
}
