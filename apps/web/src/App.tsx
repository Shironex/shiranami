import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { Sidebar } from '@/components/shared/Sidebar';
import { TopBar } from '@/components/shared/TopBar';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { PlayerBar } from '@/components/player';
import { AudioVisualizer } from '@/components/player/AudioVisualizer';
import { LibraryView } from '@/components/library/LibraryView';
import { FavoritesView } from '@/components/favorites/FavoritesView';
import { SettingsView } from '@/components/settings/SettingsView';
import { PlaylistsView } from '@/components/playlists/PlaylistsView';
import { PlaylistDetailView } from '@/components/playlists/PlaylistDetailView';
import { SearchView } from '@/components/search/SearchView';
import { LyricsPanel } from '@/components/lyrics/LyricsPanel';
import { QueuePanel } from '@/components/player/QueuePanel';
import { AmbientBackground } from '@/components/shared/AmbientBackground';
import { Toaster } from '@/components/ui/sonner';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibraryLoader } from '@/hooks/useLibraryLoader';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDismissed = useCallback(() => setSplashDone(true), []);

  useAudioEngine();
  useMediaSession();
  useLibraryLoader();

  const { handleOpenFile, handleOpenFolder, isScanning } = useLibraryActions();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const activeView = useAppStore(s => s.activeView);
  const rightPanel = useAppStore(s => s.rightPanel);
  const selectedPlaylistId = useAppStore(s => s.selectedPlaylistId);
  const showVisualizer = useAppStore(s => s.showVisualizer);

  return (
    <>
      <SplashScreen ready={true} error={null} onDismissed={handleSplashDismissed} />

      {splashDone && (
        <div
          className={cn(
            'h-screen w-screen bg-background text-foreground flex overflow-hidden relative',
            IS_ELECTRON && 'rounded-t-[10px]'
          )}
        >
          <AmbientBackground />

          {/* Sidebar */}
          <Sidebar />

          {/* Main content area */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <TopBar
              onAddFile={handleOpenFile}
              onAddFolder={handleOpenFolder}
              isScanning={isScanning}
            />

            <main className={cn(
              'flex-1 flex overflow-hidden min-h-0',
              currentTrack && 'pb-[88px]'
            )}>
              {/* Center content */}
              <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
                {activeView === 'library' && <LibraryView />}
                {activeView === 'playlists' && (
                  selectedPlaylistId ? <PlaylistDetailView /> : <PlaylistsView />
                )}
                {activeView === 'favorites' && <FavoritesView />}
                {activeView === 'search' && <SearchView />}
                {activeView === 'settings' && <SettingsView />}
              </div>

              {/* Right panel */}
              {currentTrack && rightPanel === 'lyrics' && (
                <div className="w-[320px] border-l border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30">
                  <LyricsPanel />
                </div>
              )}
              {currentTrack && rightPanel === 'queue' && (
                <div className="w-[320px] border-l border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30">
                  <QueuePanel />
                </div>
              )}
            </main>

            {/* Visualizer strip above player bar */}
            {currentTrack && showVisualizer && (
              <div className="absolute bottom-[88px] left-0 right-0 z-40 h-[48px]">
                <AudioVisualizer />
              </div>
            )}

            {/* Player bar */}
            <PlayerBar />
          </div>
        </div>
      )}

      <Toaster />
    </>
  );
}

export default App;
