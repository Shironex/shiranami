import { useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { Slider } from '@/components/ui/slider';

export function SeekBar() {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const scrubTime = usePlayerStore(s => s.scrubTime);
  const seek = usePlayerStore(s => s.seek);
  const setScrubTime = usePlayerStore(s => s.setScrubTime);

  const handleValueChange = useCallback(
    (value: number[]) => {
      setScrubTime(value[0]);
    },
    [setScrubTime]
  );

  const handleValueCommit = useCallback(
    (value: number[]) => {
      seek(value[0]);
    },
    [seek]
  );

  return (
    <Slider
      value={[scrubTime ?? currentTime]}
      max={duration || 100}
      step={0.1}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      className="w-full"
      aria-label="Seek"
    />
  );
}
