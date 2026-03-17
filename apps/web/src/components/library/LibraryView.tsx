import { useCallback } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { Button } from '@/components/ui/button';
import { Music, FolderOpen, Play } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';

// Generate a simple ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function LibraryView() {
  const queue = usePlayerStore(s => s.queue);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);

  const handleOpenFile = useCallback(async () => {
    if (!IS_ELECTRON) return;

    const filePath = await window.electronAPI.dialog.openFile();
    if (!filePath) return;

    // Extract filename as title
    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
    const title = fileName.replace(/\.[^.]+$/, '');

    const track: Track = {
      id: generateId(),
      title,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: 0,
      filePath,
    };

    const newQueue = [...queue, track];
    // If nothing is playing, start playing the new track
    if (!currentTrack) {
      setQueue(newQueue, newQueue.length - 1);
    } else {
      usePlayerStore.setState({ queue: newQueue });
    }
  }, [queue, currentTrack, setQueue]);

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(queue, index);
    },
    [queue, setQueue]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <Button onClick={handleOpenFile} variant="outline" size="sm">
          <FolderOpen className="w-4 h-4 mr-2" />
          Add File
        </Button>
      </div>

      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Music className="w-10 h-10 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-lg font-medium text-muted-foreground">No tracks yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Click "Add File" to load an audio file
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="space-y-1">
            {queue.map((track, index) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => handlePlayTrack(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                    {isActive && isPlaying ? (
                      <div className="flex items-center gap-0.5">
                        <div className="w-0.5 h-3 bg-primary rounded-full animate-pulse" />
                        <div className="w-0.5 h-4 bg-primary rounded-full animate-pulse [animation-delay:150ms]" />
                        <div className="w-0.5 h-2 bg-primary rounded-full animate-pulse [animation-delay:300ms]" />
                      </div>
                    ) : (
                      <Play className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
