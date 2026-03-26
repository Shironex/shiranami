import { memo, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface VolumeControlProps {
  sliderClassName?: string;
}

export const VolumeControl = memo(function VolumeControl({
  sliderClassName = 'w-24',
}: VolumeControlProps) {
  const volume = usePlayerStore(s => s.volume);
  const isMuted = usePlayerStore(s => s.isMuted);
  const setVolume = usePlayerStore(s => s.setVolume);
  const toggleMute = usePlayerStore(s => s.toggleMute);

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      setVolume(value[0]);
    },
    [setVolume]
  );

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleMute}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <VolumeIcon className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{isMuted ? 'Unmute (M)' : 'Mute (M)'}</TooltipContent>
      </Tooltip>
      <Slider
        value={[isMuted ? 0 : volume]}
        max={1}
        step={0.01}
        onValueChange={handleVolumeChange}
        className={cn(sliderClassName)}
        aria-label="Volume"
      />
    </div>
  );
});
