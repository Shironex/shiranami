import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { TitleBar } from '@/components/shared/TitleBar';
import { SplashScreen } from '@/components/splash/SplashScreen';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDismissed = useCallback(() => setSplashDone(true), []);

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

          <main className="flex-1 flex items-center justify-center overflow-hidden">
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold text-gradient">Shiranami</h1>
              <p className="text-muted-foreground text-lg">
                白波 — Your personal music player
              </p>
              <p className="text-muted-foreground/60 text-sm">
                Phase 1 complete — scaffold ready
              </p>
            </div>
          </main>
        </div>
      )}
    </>
  );
}

export default App;
