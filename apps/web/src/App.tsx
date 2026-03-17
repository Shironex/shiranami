import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { TitleBar } from '@/components/shared/TitleBar';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { PlayerBar } from '@/components/player';
import { LibraryView } from '@/components/library/LibraryView';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useMediaSession } from '@/hooks/useMediaSession';
import { usePlayerStore } from '@/stores/usePlayerStore';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDismissed = useCallback(() => setSplashDone(true), []);

  // Mount the audio engine at root level
  useAudioEngine();
  useMediaSession();

  const currentTrack = usePlayerStore(s => s.currentTrack);

  return (
    <>
      <SplashScreen ready={true} error={null} onDismissed={handleSplashDismissed} />

      {splashDone && (
        <div
          className={cn(
            'h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden relative',
            IS_ELECTRON && 'rounded-t-[10px]'
          )}
        >
          {IS_ELECTRON && <TitleBar />}

          <main className={cn(
            'flex-1 flex overflow-hidden',
            currentTrack && 'pb-20'
          )}>
            <LibraryView />
          </main>

          <PlayerBar />
        </div>
      )}
    </>
  );
}

export default App;
