import { useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { Slider } from '@/components/ui/slider';

export function SeekBar() {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const seek = usePlayerStore(s => s.seek);

  const handleSeek = useCallback(
    (value: number[]) => {
      seek(value[0]);
    },
    [seek]
  );

  return (
    <Slider
      value={[currentTime]}
      max={duration || 100}
      step={0.1}
      onValueChange={handleSeek}
      className="w-full"
      aria-label="Seek"
    />
  );
}
