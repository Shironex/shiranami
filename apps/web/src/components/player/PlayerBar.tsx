import { usePlayerStore } from '@/stores/usePlayerStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { Music } from 'lucide-react';

export function PlayerBar() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);

  if (!currentTrack) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'h-20 px-4',
        'flex items-center gap-4',
        'glass border-t border-border/50',
        'transition-transform duration-300',
      )}
    >
      {/* Track info - left */}
      <div className="flex items-center gap-3 w-[280px] min-w-0">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {currentTrack.albumArt ? (
            <img
              src={currentTrack.albumArt}
              alt={currentTrack.album}
              className="w-full h-full object-cover"
            />
          ) : (
            <Music className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {currentTrack.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {currentTrack.artist}
          </p>
        </div>
      </div>

      {/* Center - controls + seek */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-[600px] mx-auto">
        <PlayerControls />
        <div className="w-full flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
            {formatDuration(currentTime)}
          </span>
          <SeekBar />
          <span className="text-[11px] text-muted-foreground tabular-nums w-10">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Right - volume */}
      <div className="w-[180px] flex justify-end">
        <VolumeControl />
      </div>
    </div>
  );
}
