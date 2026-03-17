import { useCallback, useState } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { Button } from '@/components/ui/button';
import { Music, FolderOpen, File, Play, Loader2 } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { formatDuration } from '@shiranami/shared';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function LibraryView() {
  const queue = usePlayerStore(s => s.queue);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const [isScanning, setIsScanning] = useState(false);

  const handleOpenFile = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const filePath = await window.electronAPI.dialog.openFile();
    if (!filePath) return;

    const { metadata } = await window.electronAPI.library.parseMetadata(filePath);
    const track: Track = {
      id: generateId(),
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      duration: metadata.duration,
      filePath,
      albumArt: metadata.albumArt ?? undefined,
    };

    const newQueue = [...queue, track];
    if (!currentTrack) {
      setQueue(newQueue, newQueue.length - 1);
    } else {
      usePlayerStore.setState({ queue: newQueue });
    }
  }, [queue, currentTrack, setQueue]);

  const handleOpenFolder = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const dirPath = await window.electronAPI.dialog.openDirectory();
    if (!dirPath) return;

    setIsScanning(true);
    try {
      const results = await window.electronAPI.library.scanFolder(dirPath);
      const newTracks: Track[] = results.map(r => ({
        id: generateId(),
        title: r.metadata.title,
        artist: r.metadata.artist,
        album: r.metadata.album,
        duration: r.metadata.duration,
        filePath: r.filePath,
        albumArt: r.metadata.albumArt ?? undefined,
      }));

      if (newTracks.length === 0) return;

      const combined = [...queue, ...newTracks];
      if (!currentTrack) {
        setQueue(combined, 0);
      } else {
        usePlayerStore.setState({ queue: combined });
      }
    } finally {
      setIsScanning(false);
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
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenFolder} variant="outline" size="sm" disabled={isScanning}>
            {isScanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4 mr-2" />
            )}
            {isScanning ? 'Scanning...' : 'Add Folder'}
          </Button>
          <Button onClick={handleOpenFile} variant="outline" size="sm">
            <File className="w-4 h-4 mr-2" />
            Add File
          </Button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Music className="w-10 h-10 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-lg font-medium text-muted-foreground">No tracks yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Add files or a folder to start listening
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="space-y-0.5">
            {queue.map((track, index) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => handlePlayTrack(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {track.albumArt ? (
                      <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
                    ) : isActive && isPlaying ? (
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
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {track.duration > 0 ? formatDuration(track.duration) : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
